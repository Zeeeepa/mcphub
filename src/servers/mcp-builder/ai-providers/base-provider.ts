/**
 * Base AI Provider Interface for Multi-LLM Integration
 * Supports Gemini, OpenAI, and OpenRouter with unified API
 */

export interface AIProviderConfig {
  apiKey: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model?: string;
  finishReason?: string;
}

export interface CodeAnalysisRequest {
  code: string;
  filePath: string;
  language: string;
  context?: string;
  analysisType: 'security' | 'performance' | 'quality' | 'architecture' | 'redundancy';
}

export interface CodeAnalysisResponse {
  analysis: string;
  suggestions: Array<{
    type: 'improvement' | 'fix' | 'optimization' | 'refactor';
    description: string;
    code?: string;
    confidence: number;
    impact: 'low' | 'medium' | 'high';
  }>;
  issues: Array<{
    severity: 'info' | 'warning' | 'error' | 'critical';
    message: string;
    line?: number;
    column?: number;
  }>;
}

export interface ModificationRequest {
  originalCode: string;
  filePath: string;
  language: string;
  instructions: string;
  context?: string;
  safetyLevel: 'conservative' | 'moderate' | 'aggressive';
}

export interface ModificationResponse {
  modifiedCode: string;
  explanation: string;
  changes: Array<{
    type: 'addition' | 'deletion' | 'modification';
    description: string;
    lineStart: number;
    lineEnd: number;
  }>;
  confidence: number;
  risks: Array<{
    type: 'breaking_change' | 'performance' | 'security' | 'compatibility';
    description: string;
    severity: 'low' | 'medium' | 'high';
  }>;
}

export abstract class BaseAIProvider {
  protected config: AIProviderConfig;
  protected rateLimiter: Map<string, number> = new Map();

  constructor(config: AIProviderConfig) {
    this.config = config;
  }

  abstract get name(): string;
  abstract get supportedModels(): string[];

  /**
   * Generate a completion from messages
   */
  abstract generateCompletion(
    messages: AIMessage[],
    options?: Partial<AIProviderConfig>
  ): Promise<AIResponse>;

  /**
   * Analyze code for various aspects (security, performance, quality, etc.)
   */
  async analyzeCode(request: CodeAnalysisRequest): Promise<CodeAnalysisResponse> {
    const systemPrompt = this.getAnalysisSystemPrompt(request.analysisType);
    const userPrompt = this.formatCodeAnalysisPrompt(request);

    const response = await this.generateCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]);

    return this.parseCodeAnalysisResponse(response.content);
  }

  /**
   * Generate code modifications based on instructions
   */
  async modifyCode(request: ModificationRequest): Promise<ModificationResponse> {
    const systemPrompt = this.getModificationSystemPrompt(request.safetyLevel);
    const userPrompt = this.formatModificationPrompt(request);

    const response = await this.generateCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]);

    return this.parseModificationResponse(response.content);
  }

  /**
   * Check rate limits for the provider
   */
  protected checkRateLimit(): boolean {
    const now = Date.now();
    const lastRequest = this.rateLimiter.get(this.name) || 0;
    const minInterval = this.getMinRequestInterval();

    if (now - lastRequest < minInterval) {
      return false;
    }

    this.rateLimiter.set(this.name, now);
    return true;
  }

  /**
   * Get minimum interval between requests (ms)
   */
  protected abstract getMinRequestInterval(): number;

  /**
   * Get system prompt for code analysis
   */
  private getAnalysisSystemPrompt(analysisType: string): string {
    const basePrompt = `You are an expert code analyst specializing in ${analysisType} analysis. 
    Analyze the provided code and return your findings in JSON format with the following structure:
    {
      "analysis": "detailed analysis description",
      "suggestions": [
        {
          "type": "improvement|fix|optimization|refactor",
          "description": "what to do",
          "code": "suggested code if applicable",
          "confidence": 0.0-1.0,
          "impact": "low|medium|high"
        }
      ],
      "issues": [
        {
          "severity": "info|warning|error|critical",
          "message": "issue description",
          "line": 123,
          "column": 45
        }
      ]
    }`;

    switch (analysisType) {
      case 'security':
        return basePrompt + '\n\nFocus on security vulnerabilities, injection attacks, authentication issues, and data exposure risks.';
      case 'performance':
        return basePrompt + '\n\nFocus on performance bottlenecks, inefficient algorithms, memory leaks, and optimization opportunities.';
      case 'quality':
        return basePrompt + '\n\nFocus on code quality, maintainability, readability, and best practices adherence.';
      case 'architecture':
        return basePrompt + '\n\nFocus on architectural patterns, design principles, modularity, and structural improvements.';
      case 'redundancy':
        return basePrompt + '\n\nFocus on identifying duplicate code, unnecessary functions, and consolidation opportunities.';
      default:
        return basePrompt + '\n\nProvide a comprehensive analysis covering all aspects.';
    }
  }

  /**
   * Get system prompt for code modification
   */
  private getModificationSystemPrompt(safetyLevel: string): string {
    const basePrompt = `You are an expert code modifier. Modify the provided code according to the instructions.
    Return your response in JSON format with the following structure:
    {
      "modifiedCode": "the complete modified code",
      "explanation": "explanation of changes made",
      "changes": [
        {
          "type": "addition|deletion|modification",
          "description": "what was changed",
          "lineStart": 123,
          "lineEnd": 125
        }
      ],
      "confidence": 0.0-1.0,
      "risks": [
        {
          "type": "breaking_change|performance|security|compatibility",
          "description": "potential risk description",
          "severity": "low|medium|high"
        }
      ]
    }`;

    switch (safetyLevel) {
      case 'conservative':
        return basePrompt + '\n\nBe extremely cautious. Only make minimal, safe changes. Avoid any modifications that could break functionality.';
      case 'moderate':
        return basePrompt + '\n\nMake reasonable improvements while maintaining safety. Consider performance and maintainability.';
      case 'aggressive':
        return basePrompt + '\n\nMake comprehensive improvements including architectural changes. Optimize for best practices and performance.';
      default:
        return basePrompt;
    }
  }

  /**
   * Format code analysis prompt
   */
  private formatCodeAnalysisPrompt(request: CodeAnalysisRequest): string {
    return `File: ${request.filePath}
Language: ${request.language}
${request.context ? `Context: ${request.context}` : ''}

Code to analyze:
\`\`\`${request.language}
${request.code}
\`\`\`

Please analyze this code for ${request.analysisType} issues and provide suggestions for improvement.`;
  }

  /**
   * Format code modification prompt
   */
  private formatModificationPrompt(request: ModificationRequest): string {
    return `File: ${request.filePath}
Language: ${request.language}
${request.context ? `Context: ${request.context}` : ''}

Original code:
\`\`\`${request.language}
${request.originalCode}
\`\`\`

Instructions: ${request.instructions}

Please modify the code according to the instructions and return the complete modified code.`;
  }

  /**
   * Parse code analysis response
   */
  private parseCodeAnalysisResponse(content: string): CodeAnalysisResponse {
    try {
      const parsed = JSON.parse(content);
      return {
        analysis: parsed.analysis || '',
        suggestions: parsed.suggestions || [],
        issues: parsed.issues || []
      };
    } catch (error) {
      // Fallback parsing if JSON is malformed
      return {
        analysis: content,
        suggestions: [],
        issues: []
      };
    }
  }

  /**
   * Parse code modification response
   */
  private parseModificationResponse(content: string): ModificationResponse {
    try {
      const parsed = JSON.parse(content);
      return {
        modifiedCode: parsed.modifiedCode || '',
        explanation: parsed.explanation || '',
        changes: parsed.changes || [],
        confidence: parsed.confidence || 0.5,
        risks: parsed.risks || []
      };
    } catch (error) {
      // Fallback parsing if JSON is malformed
      return {
        modifiedCode: content,
        explanation: 'Code modification completed',
        changes: [],
        confidence: 0.5,
        risks: []
      };
    }
  }

  /**
   * Validate API key format
   */
  protected validateApiKey(): boolean {
    return Boolean(this.config.apiKey && this.config.apiKey.length > 0);
  }

  /**
   * Get default model for the provider
   */
  abstract getDefaultModel(): string;

  /**
   * Check if provider is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      if (!this.validateApiKey()) {
        return false;
      }

      // Simple test request to check availability
      const testResponse = await this.generateCompletion([
        { role: 'user', content: 'Hello' }
      ], { maxTokens: 10 });

      return Boolean(testResponse.content);
    } catch (error) {
      console.error(`Provider ${this.name} is not available:`, error);
      return false;
    }
  }
}
