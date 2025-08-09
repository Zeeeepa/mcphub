/**
 * Google Gemini Provider Implementation
 * Supports Gemini Pro, Gemini Flash, and other Google AI models
 */

import { BaseAIProvider, AIProviderConfig, AIMessage, AIResponse } from './base-provider.js';

interface GeminiMessage {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{ text: string }>;
      role: string;
    };
    finishReason: string;
  }>;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

export class GeminiProvider extends BaseAIProvider {
  private readonly baseUrl = 'https://generativelanguage.googleapis.com/v1beta';

  get name(): string {
    return 'gemini';
  }

  get supportedModels(): string[] {
    return [
      'gemini-1.5-pro',
      'gemini-1.5-flash',
      'gemini-1.0-pro',
      'gemini-pro',
      'gemini-pro-vision'
    ];
  }

  getDefaultModel(): string {
    return 'gemini-1.5-flash';
  }

  protected getMinRequestInterval(): number {
    return 200; // 200ms between requests (more conservative for Gemini)
  }

  async generateCompletion(
    messages: AIMessage[],
    options?: Partial<AIProviderConfig>
  ): Promise<AIResponse> {
    if (!this.checkRateLimit()) {
      throw new Error('Rate limit exceeded for Gemini provider');
    }

    const config = { ...this.config, ...options };
    const model = config.model || this.getDefaultModel();

    // Convert messages to Gemini format
    const geminiMessages = this.convertMessagesToGemini(messages);
    
    const requestBody = {
      contents: geminiMessages,
      generationConfig: {
        temperature: config.temperature || 0.1,
        maxOutputTokens: config.maxTokens || 4000,
        topP: 0.8,
        topK: 10,
      },
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.timeout || 30000);

      const url = `${this.baseUrl}/models/${model}:generateContent?key=${config.apiKey}`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Gemini API error: ${response.status} - ${errorData.error?.message || response.statusText}`);
      }

      const data: GeminiResponse = await response.json();

      if (!data.candidates || data.candidates.length === 0) {
        throw new Error('No response from Gemini API');
      }

      const candidate = data.candidates[0];
      if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
        throw new Error('Invalid response format from Gemini API');
      }

      return {
        content: candidate.content.parts[0].text,
        usage: data.usageMetadata ? {
          promptTokens: data.usageMetadata.promptTokenCount,
          completionTokens: data.usageMetadata.candidatesTokenCount,
          totalTokens: data.usageMetadata.totalTokenCount,
        } : undefined,
        model,
        finishReason: candidate.finishReason,
      };
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error('Gemini request timed out');
        }
        throw error;
      }
      throw new Error(`Gemini request failed: ${String(error)}`);
    }
  }

  protected validateApiKey(): boolean {
    return Boolean(
      this.config.apiKey && 
      this.config.apiKey.length > 20
    );
  }

  /**
   * Convert standard messages to Gemini format
   */
  private convertMessagesToGemini(messages: AIMessage[]): GeminiMessage[] {
    const geminiMessages: GeminiMessage[] = [];
    let systemPrompt = '';

    // Extract system message and combine with first user message
    for (const message of messages) {
      if (message.role === 'system') {
        systemPrompt += message.content + '\n\n';
      } else if (message.role === 'user') {
        const content = systemPrompt + message.content;
        geminiMessages.push({
          role: 'user',
          parts: [{ text: content }]
        });
        systemPrompt = ''; // Only add system prompt to first user message
      } else if (message.role === 'assistant') {
        geminiMessages.push({
          role: 'model',
          parts: [{ text: message.content }]
        });
      }
    }

    return geminiMessages;
  }

  /**
   * Get model-specific context limits
   */
  getContextLimit(model?: string): number {
    const modelName = model || this.getDefaultModel();
    
    switch (modelName) {
      case 'gemini-1.5-pro':
        return 2000000; // 2M tokens
      case 'gemini-1.5-flash':
        return 1000000; // 1M tokens
      case 'gemini-1.0-pro':
      case 'gemini-pro':
        return 32768;
      case 'gemini-pro-vision':
        return 16384;
      default:
        return 32768;
    }
  }

  /**
   * Estimate token count for text (rough approximation)
   */
  estimateTokens(text: string): number {
    // Gemini uses a different tokenization, roughly 1 token ≈ 3.5 characters
    return Math.ceil(text.length / 3.5);
  }

  /**
   * Check if text fits within model context limit
   */
  fitsInContext(text: string, model?: string): boolean {
    const tokenCount = this.estimateTokens(text);
    const contextLimit = this.getContextLimit(model);
    
    // Reserve 4000 tokens for response
    return tokenCount < (contextLimit - 4000);
  }

  /**
   * Split large text into chunks that fit within context
   */
  splitIntoChunks(text: string, model?: string): string[] {
    const contextLimit = this.getContextLimit(model);
    const maxChunkTokens = Math.floor((contextLimit - 4000) * 0.8); // 80% of available space
    const maxChunkChars = maxChunkTokens * 3.5; // Rough conversion

    if (text.length <= maxChunkChars) {
      return [text];
    }

    const chunks: string[] = [];
    let currentPos = 0;

    while (currentPos < text.length) {
      let chunkEnd = Math.min(currentPos + maxChunkChars, text.length);
      
      // Try to break at a natural boundary (newline, sentence, word)
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
   * Get cost estimate for a request (Gemini pricing)
   */
  estimateCost(promptTokens: number, completionTokens: number, model?: string): number {
    const modelName = model || this.getDefaultModel();
    
    // Pricing as of 2024 (per 1M tokens)
    const pricing: Record<string, { input: number; output: number }> = {
      'gemini-1.5-pro': { input: 3.50, output: 10.50 },
      'gemini-1.5-flash': { input: 0.075, output: 0.30 },
      'gemini-1.0-pro': { input: 0.50, output: 1.50 },
      'gemini-pro': { input: 0.50, output: 1.50 },
      'gemini-pro-vision': { input: 0.25, output: 0.50 },
    };

    const modelPricing = pricing[modelName] || pricing['gemini-1.5-flash'];
    
    const inputCost = (promptTokens / 1000000) * modelPricing.input;
    const outputCost = (completionTokens / 1000000) * modelPricing.output;
    
    return inputCost + outputCost;
  }

  /**
   * Check if model supports vision/image inputs
   */
  supportsVision(model?: string): boolean {
    const modelName = model || this.getDefaultModel();
    return modelName.includes('vision') || modelName.includes('1.5');
  }

  /**
   * Get safety settings for content generation
   */
  getSafetySettings() {
    return [
      {
        category: 'HARM_CATEGORY_HARASSMENT',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE'
      },
      {
        category: 'HARM_CATEGORY_HATE_SPEECH',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE'
      },
      {
        category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE'
      },
      {
        category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE'
      }
    ];
  }
}
