/**
 * OpenAI Provider Implementation
 * Supports GPT-4, GPT-3.5-turbo, and other OpenAI models
 */

import { BaseAIProvider, AIProviderConfig, AIMessage, AIResponse } from './base-provider.js';

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAIResponse {
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

export class OpenAIProvider extends BaseAIProvider {
  private readonly baseUrl = 'https://api.openai.com/v1';

  get name(): string {
    return 'openai';
  }

  get supportedModels(): string[] {
    return [
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-4-turbo',
      'gpt-4',
      'gpt-3.5-turbo',
      'gpt-3.5-turbo-16k'
    ];
  }

  getDefaultModel(): string {
    return 'gpt-4o-mini';
  }

  protected getMinRequestInterval(): number {
    return 100; // 100ms between requests
  }

  async generateCompletion(
    messages: AIMessage[],
    options?: Partial<AIProviderConfig>
  ): Promise<AIResponse> {
    if (!this.checkRateLimit()) {
      throw new Error('Rate limit exceeded for OpenAI provider');
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
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.timeout || 30000);

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`OpenAI API error: ${response.status} - ${errorData.error?.message || response.statusText}`);
      }

      const data: OpenAIResponse = await response.json();

      if (!data.choices || data.choices.length === 0) {
        throw new Error('No response from OpenAI API');
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
          throw new Error('OpenAI request timed out');
        }
        throw error;
      }
      throw new Error(`OpenAI request failed: ${String(error)}`);
    }
  }

  protected validateApiKey(): boolean {
    return Boolean(
      this.config.apiKey && 
      this.config.apiKey.startsWith('sk-') && 
      this.config.apiKey.length > 20
    );
  }

  /**
   * Get model-specific context limits
   */
  getContextLimit(model?: string): number {
    const modelName = model || this.getDefaultModel();
    
    switch (modelName) {
      case 'gpt-4o':
        return 128000;
      case 'gpt-4o-mini':
        return 128000;
      case 'gpt-4-turbo':
        return 128000;
      case 'gpt-4':
        return 8192;
      case 'gpt-3.5-turbo-16k':
        return 16384;
      case 'gpt-3.5-turbo':
        return 4096;
      default:
        return 4096;
    }
  }

  /**
   * Estimate token count for text (rough approximation)
   */
  estimateTokens(text: string): number {
    // Rough approximation: 1 token ≈ 4 characters for English text
    return Math.ceil(text.length / 4);
  }

  /**
   * Check if text fits within model context limit
   */
  fitsInContext(text: string, model?: string): boolean {
    const tokenCount = this.estimateTokens(text);
    const contextLimit = this.getContextLimit(model);
    
    // Reserve 1000 tokens for response
    return tokenCount < (contextLimit - 1000);
  }

  /**
   * Split large text into chunks that fit within context
   */
  splitIntoChunks(text: string, model?: string): string[] {
    const contextLimit = this.getContextLimit(model);
    const maxChunkTokens = Math.floor((contextLimit - 1000) * 0.8); // 80% of available space
    const maxChunkChars = maxChunkTokens * 4; // Rough conversion

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
   * Get cost estimate for a request
   */
  estimateCost(promptTokens: number, completionTokens: number, model?: string): number {
    const modelName = model || this.getDefaultModel();
    
    // Pricing as of 2024 (per 1M tokens)
    const pricing: Record<string, { input: number; output: number }> = {
      'gpt-4o': { input: 5.00, output: 15.00 },
      'gpt-4o-mini': { input: 0.15, output: 0.60 },
      'gpt-4-turbo': { input: 10.00, output: 30.00 },
      'gpt-4': { input: 30.00, output: 60.00 },
      'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
      'gpt-3.5-turbo-16k': { input: 3.00, output: 4.00 },
    };

    const modelPricing = pricing[modelName] || pricing['gpt-3.5-turbo'];
    
    const inputCost = (promptTokens / 1000000) * modelPricing.input;
    const outputCost = (completionTokens / 1000000) * modelPricing.output;
    
    return inputCost + outputCost;
  }
}
