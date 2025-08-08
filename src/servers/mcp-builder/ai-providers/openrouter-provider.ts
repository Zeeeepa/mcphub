/**
 * OpenRouter Provider Implementation
 * Supports multiple models through OpenRouter's unified API
 */

import { BaseAIProvider, AIProviderConfig, AIMessage, AIResponse } from './base-provider.js';

interface OpenRouterResponse {
  choices: Array<{
    message: {
      content: string;
      role: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  model: string;
}

export class OpenRouterProvider extends BaseAIProvider {
  private readonly baseUrl = 'https://openrouter.ai/api/v1';

  get name(): string {
    return 'openrouter';
  }

  get supportedModels(): string[] {
    return [
      // OpenAI models via OpenRouter
      'openai/gpt-4o',
      'openai/gpt-4o-mini',
      'openai/gpt-4-turbo',
      'openai/gpt-3.5-turbo',
      
      // Anthropic models via OpenRouter
      'anthropic/claude-3.5-sonnet',
      'anthropic/claude-3-haiku',
      'anthropic/claude-3-opus',
      
      // Google models via OpenRouter
      'google/gemini-pro-1.5',
      'google/gemini-flash-1.5',
      
      // Meta models via OpenRouter
      'meta-llama/llama-3.1-405b-instruct',
      'meta-llama/llama-3.1-70b-instruct',
      'meta-llama/llama-3.1-8b-instruct',
      
      // Mistral models via OpenRouter
      'mistralai/mistral-large',
      'mistralai/mistral-medium',
      'mistralai/mistral-small',
      
      // Other popular models
      'perplexity/llama-3.1-sonar-large-128k-online',
      'qwen/qwen-2.5-72b-instruct',
      'cohere/command-r-plus',
    ];
  }

  getDefaultModel(): string {
    return 'openai/gpt-4o-mini';
  }

  protected getMinRequestInterval(): number {
    return 150; // 150ms between requests
  }

  async generateCompletion(
    messages: AIMessage[],
    options?: Partial<AIProviderConfig>
  ): Promise<AIResponse> {
    if (!this.checkRateLimit()) {
      throw new Error('Rate limit exceeded for OpenRouter provider');
    }

    const config = { ...this.config, ...options };
    const model = config.model || this.getDefaultModel();

    const requestBody = {
      model,
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      temperature: config.temperature || 0.1,
      max_tokens: config.maxTokens || 4000,
      top_p: 0.9,
      frequency_penalty: 0,
      presence_penalty: 0,
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.timeout || 45000);

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
          'HTTP-Referer': 'https://mcphub.ai', // Required by OpenRouter
          'X-Title': 'mcphub AI-Powered MCP Builder', // Optional but recommended
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`OpenRouter API error: ${response.status} - ${errorData.error?.message || response.statusText}`);
      }

      const data: OpenRouterResponse = await response.json();

      if (!data.choices || data.choices.length === 0) {
        throw new Error('No response from OpenRouter API');
      }

      return {
        content: data.choices[0].message.content,
        usage: {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        },
        model: data.model,
        finishReason: data.choices[0].finish_reason,
      };
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error('OpenRouter request timed out');
        }
        throw error;
      }
      throw new Error(`OpenRouter request failed: ${String(error)}`);
    }
  }

  protected validateApiKey(): boolean {
    return Boolean(
      this.config.apiKey && 
      this.config.apiKey.startsWith('sk-or-') && 
      this.config.apiKey.length > 20
    );
  }

  /**
   * Get model-specific context limits
   */
  getContextLimit(model?: string): number {
    const modelName = model || this.getDefaultModel();
    
    // Context limits for different model families
    if (modelName.includes('gpt-4o')) {
      return 128000;
    } else if (modelName.includes('gpt-4')) {
      return 8192;
    } else if (modelName.includes('gpt-3.5')) {
      return 16384;
    } else if (modelName.includes('claude-3.5')) {
      return 200000;
    } else if (modelName.includes('claude-3')) {
      return 200000;
    } else if (modelName.includes('gemini-pro-1.5')) {
      return 2000000;
    } else if (modelName.includes('gemini-flash-1.5')) {
      return 1000000;
    } else if (modelName.includes('llama-3.1-405b')) {
      return 131072;
    } else if (modelName.includes('llama-3.1-70b')) {
      return 131072;
    } else if (modelName.includes('llama-3.1-8b')) {
      return 131072;
    } else if (modelName.includes('mistral-large')) {
      return 128000;
    } else if (modelName.includes('sonar-large-128k')) {
      return 127072;
    } else if (modelName.includes('qwen-2.5')) {
      return 131072;
    } else if (modelName.includes('command-r-plus')) {
      return 128000;
    }
    
    // Default fallback
    return 32768;
  }

  /**
   * Estimate token count for text (rough approximation)
   */
  estimateTokens(text: string): number {
    // General approximation: 1 token ≈ 4 characters for most models
    return Math.ceil(text.length / 4);
  }

  /**
   * Check if text fits within model context limit
   */
  fitsInContext(text: string, model?: string): boolean {
    const tokenCount = this.estimateTokens(text);
    const contextLimit = this.getContextLimit(model);
    
    // Reserve tokens for response based on model type
    const reservedTokens = this.getReservedTokens(model);
    return tokenCount < (contextLimit - reservedTokens);
  }

  /**
   * Get reserved tokens for response based on model
   */
  private getReservedTokens(model?: string): number {
    const modelName = model || this.getDefaultModel();
    
    // Larger models can generate longer responses
    if (modelName.includes('405b') || modelName.includes('claude-3')) {
      return 8000;
    } else if (modelName.includes('70b') || modelName.includes('gemini')) {
      return 4000;
    } else {
      return 2000;
    }
  }

  /**
   * Split large text into chunks that fit within context
   */
  splitIntoChunks(text: string, model?: string): string[] {
    const contextLimit = this.getContextLimit(model);
    const reservedTokens = this.getReservedTokens(model);
    const maxChunkTokens = Math.floor((contextLimit - reservedTokens) * 0.8);
    const maxChunkChars = maxChunkTokens * 4; // Rough conversion

    if (text.length <= maxChunkChars) {
      return [text];
    }

    const chunks: string[] = [];
    let currentPos = 0;

    while (currentPos < text.length) {
      let chunkEnd = Math.min(currentPos + maxChunkChars, text.length);
      
      // Try to break at a natural boundary
      if (chunkEnd < text.length) {
        const newlinePos = text.lastIndexOf('\n', chunkEnd);
        const sentencePos = text.lastIndexOf('.', chunkEnd);
        const spacePos = text.lastIndexOf(' ', chunkEnd);
        
        if (newlinePos > currentPos + maxChunkChars * 0.5) {
          chunkEnd = newlinePos + 1;
        } else if (sentencePos > currentPos + maxChunkChars * 0.5) {
          chunkEnd = sentencePos + 1;
        } else if (spacePos > currentPos + maxChunkChars * 0.5) {
          chunkEnd = spacePos + 1;
        }
      }

      chunks.push(text.slice(currentPos, chunkEnd));
      currentPos = chunkEnd;
    }

    return chunks;
  }

  /**
   * Get cost estimate for a request (OpenRouter pricing varies by model)
   */
  estimateCost(promptTokens: number, completionTokens: number, model?: string): number {
    const modelName = model || this.getDefaultModel();
    
    // Approximate pricing (per 1M tokens) - OpenRouter adds markup
    const pricing: Record<string, { input: number; output: number }> = {
      'openai/gpt-4o': { input: 5.00, output: 15.00 },
      'openai/gpt-4o-mini': { input: 0.15, output: 0.60 },
      'openai/gpt-4-turbo': { input: 10.00, output: 30.00 },
      'openai/gpt-3.5-turbo': { input: 0.50, output: 1.50 },
      'anthropic/claude-3.5-sonnet': { input: 3.00, output: 15.00 },
      'anthropic/claude-3-haiku': { input: 0.25, output: 1.25 },
      'anthropic/claude-3-opus': { input: 15.00, output: 75.00 },
      'google/gemini-pro-1.5': { input: 3.50, output: 10.50 },
      'google/gemini-flash-1.5': { input: 0.075, output: 0.30 },
      'meta-llama/llama-3.1-405b-instruct': { input: 3.50, output: 3.50 },
      'meta-llama/llama-3.1-70b-instruct': { input: 0.88, output: 0.88 },
      'meta-llama/llama-3.1-8b-instruct': { input: 0.055, output: 0.055 },
    };

    const modelPricing = pricing[modelName] || { input: 1.00, output: 2.00 }; // Default fallback
    
    const inputCost = (promptTokens / 1000000) * modelPricing.input;
    const outputCost = (completionTokens / 1000000) * modelPricing.output;
    
    return inputCost + outputCost;
  }

  /**
   * Get available models from OpenRouter API
   */
  async getAvailableModels(): Promise<Array<{ id: string; name: string; description: string }>> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.statusText}`);
      }

      const data = await response.json();
      return data.data || [];
    } catch (error) {
      console.error('Failed to fetch OpenRouter models:', error);
      return [];
    }
  }

  /**
   * Check model availability and pricing
   */
  async getModelInfo(modelId: string): Promise<any> {
    try {
      const models = await this.getAvailableModels();
      return models.find(model => model.id === modelId);
    } catch (error) {
      console.error(`Failed to get info for model ${modelId}:`, error);
      return null;
    }
  }
}
