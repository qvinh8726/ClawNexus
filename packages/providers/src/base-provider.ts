/**
 * ClawAI Gateway - Base Provider
 * Abstract base class for all AI providers
 */

import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
  ProviderType,
} from '@clawai/shared-types';

import type {
  ProviderConfig,
  ProviderResult,
  StreamResult,
  CostEstimate,
  ModelInfo,
  ProviderHealthStatus,
  ProviderEventHandler,
  ProviderEvent,
  CompletionOptions,
} from './types.js';

export abstract class BaseProvider {
  protected config: ProviderConfig;
  protected eventHandlers: ProviderEventHandler[] = [];

  abstract readonly providerType: ProviderType;
  abstract readonly displayName: string;
  abstract readonly supportedModels: ModelInfo[];

  constructor(config: ProviderConfig) {
    this.config = {
      timeout: 60000,
      maxRetries: 2,
      ...config,
    };
  }

  /**
   * Generate a chat completion
   */
  abstract generateChatCompletion(
    request: ChatCompletionRequest,
    options?: CompletionOptions
  ): Promise<ProviderResult>;

  /**
   * Generate a streaming chat completion
   */
  abstract streamCompletion(
    request: ChatCompletionRequest,
    options?: CompletionOptions
  ): Promise<StreamResult>;

  /**
   * Estimate the cost of a request
   */
  abstract estimateCost(
    request: ChatCompletionRequest,
    estimatedOutputTokens?: number
  ): CostEstimate;

  /**
   * Count tokens in a message
   */
  abstract countTokens(text: string): number;

  /**
   * Check provider health
   */
  async checkHealth(): Promise<ProviderHealthStatus> {
    const startTime = Date.now();

    try {
      const result = await this.generateChatCompletion({
        model: this.config.defaultModel || this.supportedModels[0]?.id || '',
        messages: [{ role: 'user', content: 'ping' }],
        maxTokens: 5,
      });

      return {
        healthy: result.success,
        latencyMs: Date.now() - startTime,
        errorMessage: result.error?.message,
        lastChecked: new Date(),
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - startTime,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        lastChecked: new Date(),
      };
    }
  }

  /**
   * Get model info by ID
   */
  getModelInfo(modelId: string): ModelInfo | undefined {
    return this.supportedModels.find((m) => m.id === modelId);
  }

  /**
   * Check if a model is supported
   */
  isModelSupported(modelId: string): boolean {
    return this.supportedModels.some((m) => m.id === modelId);
  }

  /**
   * Register an event handler
   */
  on(handler: ProviderEventHandler): void {
    this.eventHandlers.push(handler);
  }

  /**
   * Remove an event handler
   */
  off(handler: ProviderEventHandler): void {
    const index = this.eventHandlers.indexOf(handler);
    if (index > -1) {
      this.eventHandlers.splice(index, 1);
    }
  }

  /**
   * Emit an event to all handlers
   */
  protected emit(event: Omit<ProviderEvent, 'provider' | 'timestamp'>): void {
    const fullEvent: ProviderEvent = {
      ...event,
      provider: this.providerType,
      timestamp: new Date(),
    };

    for (const handler of this.eventHandlers) {
      try {
        handler(fullEvent);
      } catch (error) {
        console.error('Event handler error:', error);
      }
    }
  }

  /**
   * Make an HTTP request with retry logic
   */
  protected async fetchWithRetry(
    url: string,
    options: RequestInit,
    retries = this.config.maxRetries || 2
  ): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Don't retry on 4xx errors (except rate limits)
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          return response;
        }

        // Retry on 429 (rate limit) or 5xx errors
        if (response.status === 429 || response.status >= 500) {
          if (attempt < retries) {
            const retryAfter = parseInt(response.headers.get('retry-after') || '1', 10);
            await this.sleep(retryAfter * 1000 * (attempt + 1));
            continue;
          }
        }

        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < retries) {
          await this.sleep(1000 * (attempt + 1));
        }
      }
    }

    throw lastError || new Error('Request failed after retries');
  }

  /**
   * Sleep utility
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Generate a unique request ID
   */
  protected generateRequestId(): string {
    return `chatcmpl-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Calculate cost from tokens
   */
  protected calculateCost(
    modelInfo: ModelInfo,
    inputTokens: number,
    outputTokens: number
  ): number {
    const inputCost = (inputTokens / 1000) * modelInfo.inputCostPer1kTokens;
    const outputCost = (outputTokens / 1000) * modelInfo.outputCostPer1kTokens;
    return inputCost + outputCost;
  }
}
