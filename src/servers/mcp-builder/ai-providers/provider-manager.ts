/**
 * AI Provider Manager
 * Manages multiple AI providers and provides unified access
 */

import { BaseAIProvider, AIProviderConfig, AIMessage, AIResponse, CodeAnalysisRequest, CodeAnalysisResponse, ModificationRequest, ModificationResponse } from './base-provider.js';
import { OpenAIProvider } from './openai-provider.js';
import { GeminiProvider } from './gemini-provider.js';
import { OpenRouterProvider } from './openrouter-provider.js';

export interface ProviderManagerConfig {
  providers: {
    openai?: AIProviderConfig;
    gemini?: AIProviderConfig;
    openrouter?: AIProviderConfig;
  };
  defaultProvider?: 'openai' | 'gemini' | 'openrouter';
  ensembleMode?: boolean; // Use multiple providers for critical decisions
}

export class AIProviderManager {
  private providers: Map<string, BaseAIProvider> = new Map();
  private config: ProviderManagerConfig;

  constructor(config: ProviderManagerConfig) {
    this.config = config;
    this.initializeProviders();
  }

  private initializeProviders() {
    // Initialize OpenAI provider
    if (this.config.providers.openai) {
      const openaiProvider = new OpenAIProvider(this.config.providers.openai);
      this.providers.set('openai', openaiProvider);
    }

    // Initialize Gemini provider
    if (this.config.providers.gemini) {
      const geminiProvider = new GeminiProvider(this.config.providers.gemini);
      this.providers.set('gemini', geminiProvider);
    }

    // Initialize OpenRouter provider
    if (this.config.providers.openrouter) {
      const openrouterProvider = new OpenRouterProvider(this.config.providers.openrouter);
      this.providers.set('openrouter', openrouterProvider);
    }
  }

  /**
   * Get available providers
   */
  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Get a specific provider
   */
  getProvider(name: string): BaseAIProvider | undefined {
    return this.providers.get(name);
  }

  /**
   * Get the default provider
   */
  getDefaultProvider(): BaseAIProvider | undefined {
    const defaultName = this.config.defaultProvider || this.getAvailableProviders()[0];
    return this.providers.get(defaultName);
  }

  /**
   * Check which providers are available
   */
  async checkAvailability(): Promise<Record<string, boolean>> {
    const availability: Record<string, boolean> = {};
    
    for (const [name, provider] of this.providers) {
      try {
        availability[name] = await provider.isAvailable();
      } catch (error) {
        console.error(`Error checking availability for ${name}:`, error);
        availability[name] = false;
      }
    }

    return availability;
  }

  /**
   * Generate completion using the best available provider
   */
  async generateCompletion(
    messages: AIMessage[],
    options?: { 
      preferredProvider?: string;
      fallbackProviders?: string[];
      maxRetries?: number;
    }
  ): Promise<AIResponse & { provider: string }> {
    const maxRetries = options?.maxRetries || 3;
    let lastError: Error | null = null;

    // Determine provider order
    const providerOrder = this.getProviderOrder(options?.preferredProvider, options?.fallbackProviders);

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      for (const providerName of providerOrder) {
        const provider = this.providers.get(providerName);
        if (!provider) continue;

        try {
          const response = await provider.generateCompletion(messages);
          return { ...response, provider: providerName };
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          console.warn(`Provider ${providerName} failed (attempt ${attempt + 1}):`, error);
          
          // If it's a rate limit error, try next provider immediately
          if (error instanceof Error && error.message.includes('rate limit')) {
            continue;
          }
        }
      }

      // Wait before retrying if not the last attempt
      if (attempt < maxRetries - 1) {
        await this.delay(1000 * (attempt + 1)); // Exponential backoff
      }
    }

    throw new Error(`All providers failed after ${maxRetries} attempts. Last error: ${lastError?.message}`);
  }

  /**
   * Analyze code using the best available provider
   */
  async analyzeCode(
    request: CodeAnalysisRequest,
    options?: { preferredProvider?: string }
  ): Promise<CodeAnalysisResponse & { provider: string }> {
    const provider = this.selectProviderForTask('analysis', options?.preferredProvider);
    const response = await provider.analyzeCode(request);
    return { ...response, provider: provider.name };
  }

  /**
   * Modify code using the best available provider
   */
  async modifyCode(
    request: ModificationRequest,
    options?: { preferredProvider?: string }
  ): Promise<ModificationResponse & { provider: string }> {
    const provider = this.selectProviderForTask('modification', options?.preferredProvider);
    const response = await provider.modifyCode(request);
    return { ...response, provider: provider.name };
  }

  /**
   * Use ensemble mode for critical decisions
   */
  async ensembleAnalysis(
    request: CodeAnalysisRequest,
    options?: { minProviders?: number }
  ): Promise<{
    consensus: CodeAnalysisResponse;
    individual: Array<CodeAnalysisResponse & { provider: string }>;
    confidence: number;
  }> {
    const minProviders = options?.minProviders || 2;
    const availableProviders = Array.from(this.providers.values());
    
    if (availableProviders.length < minProviders) {
      throw new Error(`Ensemble mode requires at least ${minProviders} providers, but only ${availableProviders.length} available`);
    }

    const results: Array<CodeAnalysisResponse & { provider: string }> = [];
    
    // Get analysis from multiple providers
    for (const provider of availableProviders.slice(0, 3)) { // Limit to 3 providers for cost
      try {
        const response = await provider.analyzeCode(request);
        results.push({ ...response, provider: provider.name });
      } catch (error) {
        console.warn(`Provider ${provider.name} failed in ensemble mode:`, error);
      }
    }

    if (results.length < minProviders) {
      throw new Error(`Ensemble mode failed: only ${results.length} providers succeeded`);
    }

    // Create consensus from multiple results
    const consensus = this.createConsensus(results);
    const confidence = this.calculateConsensusConfidence(results);

    return {
      consensus,
      individual: results,
      confidence
    };
  }

  /**
   * Select the best provider for a specific task
   */
  private selectProviderForTask(task: 'analysis' | 'modification', preferredProvider?: string): BaseAIProvider {
    // If preferred provider is specified and available, use it
    if (preferredProvider && this.providers.has(preferredProvider)) {
      return this.providers.get(preferredProvider)!;
    }

    // Task-specific provider selection
    switch (task) {
      case 'analysis': {
        // Prefer providers with larger context windows for analysis
        const analysisOrder = ['gemini', 'openrouter', 'openai'];
        for (const name of analysisOrder) {
          const provider = this.providers.get(name);
          if (provider) return provider;
        }
        break;
      }
        
      case 'modification': {
        // Prefer more reliable providers for code modification
        const modificationOrder = ['openai', 'openrouter', 'gemini'];
        for (const name of modificationOrder) {
          const provider = this.providers.get(name);
          if (provider) return provider;
        }
        break;
      }
    }

    // Fallback to any available provider
    const fallbackProvider = this.getDefaultProvider();
    if (!fallbackProvider) {
      throw new Error('No AI providers available');
    }
    
    return fallbackProvider;
  }

  /**
   * Get provider order for fallback strategy
   */
  private getProviderOrder(preferred?: string, fallbacks?: string[]): string[] {
    const order: string[] = [];
    
    // Add preferred provider first
    if (preferred && this.providers.has(preferred)) {
      order.push(preferred);
    }
    
    // Add fallback providers
    if (fallbacks) {
      for (const fallback of fallbacks) {
        if (this.providers.has(fallback) && !order.includes(fallback)) {
          order.push(fallback);
        }
      }
    }
    
    // Add remaining providers
    for (const name of this.providers.keys()) {
      if (!order.includes(name)) {
        order.push(name);
      }
    }
    
    return order;
  }

  /**
   * Create consensus from multiple analysis results
   */
  private createConsensus(results: Array<CodeAnalysisResponse & { provider: string }>): CodeAnalysisResponse {
    // Combine analyses
    const combinedAnalysis = results.map(r => `[${r.provider}]: ${r.analysis}`).join('\n\n');
    
    // Merge suggestions (deduplicate similar ones)
    const allSuggestions = results.flatMap(r => r.suggestions);
    const uniqueSuggestions = this.deduplicateSuggestions(allSuggestions);
    
    // Merge issues (deduplicate similar ones)
    const allIssues = results.flatMap(r => r.issues);
    const uniqueIssues = this.deduplicateIssues(allIssues);
    
    return {
      analysis: combinedAnalysis,
      suggestions: uniqueSuggestions,
      issues: uniqueIssues
    };
  }

  /**
   * Calculate confidence based on consensus between providers
   */
  private calculateConsensusConfidence(results: Array<CodeAnalysisResponse & { provider: string }>): number {
    if (results.length < 2) return 0.5;
    
    // Simple confidence calculation based on agreement
    const suggestionTypes = results.flatMap(r => r.suggestions.map(s => s.type));
    const issueTypes = results.flatMap(r => r.issues.map(i => i.severity));
    
    // Calculate overlap in findings
    const uniqueSuggestionTypes = new Set(suggestionTypes);
    const uniqueIssueTypes = new Set(issueTypes);
    
    const suggestionOverlap = (suggestionTypes.length - uniqueSuggestionTypes.size) / suggestionTypes.length;
    const issueOverlap = (issueTypes.length - uniqueIssueTypes.size) / Math.max(issueTypes.length, 1);
    
    return Math.min(0.9, 0.5 + (suggestionOverlap + issueOverlap) / 2);
  }

  /**
   * Deduplicate similar suggestions
   */
  private deduplicateSuggestions(suggestions: any[]): any[] {
    const unique: any[] = [];
    const seen = new Set<string>();
    
    for (const suggestion of suggestions) {
      const key = `${suggestion.type}-${suggestion.description.toLowerCase().slice(0, 50)}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(suggestion);
      }
    }
    
    return unique;
  }

  /**
   * Deduplicate similar issues
   */
  private deduplicateIssues(issues: any[]): any[] {
    const unique: any[] = [];
    const seen = new Set<string>();
    
    for (const issue of issues) {
      const key = `${issue.severity}-${issue.message.toLowerCase().slice(0, 50)}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(issue);
      }
    }
    
    return unique;
  }

  /**
   * Utility function for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get provider statistics
   */
  getProviderStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    
    for (const [name, provider] of this.providers) {
      stats[name] = {
        name: provider.name,
        supportedModels: provider.supportedModels,
        defaultModel: provider.getDefaultModel(),
      };
    }
    
    return stats;
  }

  /**
   * Update provider configuration
   */
  updateProviderConfig(providerName: string, config: Partial<AIProviderConfig>): void {
    const provider = this.providers.get(providerName);
    if (provider) {
      // Update the provider's config
      Object.assign((provider as any).config, config);
    }
  }
}
