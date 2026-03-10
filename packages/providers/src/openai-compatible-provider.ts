/**
 * ClawAI Gateway - OpenAI Compatible Provider
 * Provider for any OpenAI-compatible API (Ollama, vLLM, etc.)
 */

import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
  ProviderType,
} from '@clawai/shared-types';

import { BaseProvider } from './base-provider.js';
import type {
  ProviderConfig,
  ProviderResult,
  StreamResult,
  CostEstimate,
  ModelInfo,
  ProviderError,
  CompletionOptions,
} from './types.js';
import { parseSSEStream } from './utils/sse-parser.js';
import { estimateTokenCount } from './utils/token-counter.js';

export interface OpenAICompatibleConfig extends ProviderConfig {
  models?: ModelInfo[];
}

export class OpenAICompatibleProvider extends BaseProvider {
  readonly providerType: ProviderType = 'openai-compatible';
  readonly displayName: string;
  readonly supportedModels: ModelInfo[];

  private readonly baseUrl: string;

  constructor(config: OpenAICompatibleConfig, displayName = 'OpenAI Compatible') {
    super(config);
    this.displayName = displayName;
    this.baseUrl = config.baseUrl || 'http://localhost:11434/v1';

    // Use provided models or default to a generic model
    this.supportedModels = config.models || [{
      id: config.defaultModel || 'default',
      name: 'Default Model',
      contextWindow: 8192,
      inputCostPer1kTokens: 0,
      outputCostPer1kTokens: 0,
      maxOutputTokens: 4096,
      supportsStreaming: true,
      supportsVision: false,
      supportsFunctionCalling: false,
    }];
  }

  async generateChatCompletion(
    request: ChatCompletionRequest,
    options?: CompletionOptions
  ): Promise<ProviderResult> {
    const startTime = Date.now();
    const modelInfo = this.getModelInfo(request.model);

    this.emit({ type: 'request_start', model: request.model });

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...this.config.customHeaders,
      };

      // Add auth header if API key is provided
      if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }

      const response = await this.fetchWithRetry(
        `${this.baseUrl}/chat/completions`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(this.transformRequest(request)),
          signal: options?.signal,
        }
      );

      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        const error = await this.parseError(response);
        this.emit({ type: 'request_error', model: request.model, data: error });

        if (error.isRateLimited) {
          this.emit({ type: 'rate_limited', model: request.model, data: error });
        }

        return {
          success: false,
          error,
          latencyMs,
          inputTokens: 0,
          outputTokens: 0,
          cost: 0,
        };
      }

      const data = await response.json();
      const completionResponse = this.transformResponse(data);

      const inputTokens = completionResponse.usage.promptTokens;
      const outputTokens = completionResponse.usage.completionTokens;
      const cost = modelInfo
        ? this.calculateCost(modelInfo, inputTokens, outputTokens)
        : 0;

      this.emit({ type: 'request_success', model: request.model, data: { latencyMs, cost } });

      return {
        success: true,
        response: completionResponse,
        latencyMs,
        inputTokens,
        outputTokens,
        cost,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const providerError: ProviderError = {
        code: 'NETWORK_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
        isRetryable: true,
        isRateLimited: false,
      };

      this.emit({ type: 'request_error', model: request.model, data: providerError });

      return {
        success: false,
        error: providerError,
        latencyMs,
        inputTokens: 0,
        outputTokens: 0,
        cost: 0,
      };
    }
  }

  async streamCompletion(
    request: ChatCompletionRequest,
    options?: CompletionOptions
  ): Promise<StreamResult> {
    this.emit({ type: 'stream_start', model: request.model });

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...this.config.customHeaders,
      };

      if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }

      const response = await this.fetchWithRetry(
        `${this.baseUrl}/chat/completions`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            ...this.transformRequest(request),
            stream: true,
          }),
          signal: options?.signal,
        }
      );

      if (!response.ok) {
        const error = await this.parseError(response);
        return { success: false, error };
      }

      if (!response.body) {
        return {
          success: false,
          error: {
            code: 'NO_BODY',
            message: 'Response body is empty',
            isRetryable: false,
            isRateLimited: false,
          },
        };
      }

      const stream = this.createStream(response.body, request.model, options);
      return { success: true, stream };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          isRetryable: true,
          isRateLimited: false,
        },
      };
    }
  }

  private async *createStream(
    body: ReadableStream<Uint8Array>,
    model: string,
    options?: CompletionOptions
  ): AsyncIterable<ChatCompletionChunk> {
    for await (const chunk of parseSSEStream(body)) {
      if (chunk === '[DONE]') {
        this.emit({ type: 'stream_end', model });
        break;
      }

      try {
        const data = JSON.parse(chunk);
        const transformedChunk = this.transformChunk(data);

        this.emit({ type: 'stream_chunk', model, data: transformedChunk });

        if (options?.onChunk) {
          options.onChunk(transformedChunk);
        }

        yield transformedChunk;
      } catch (e) {
        continue;
      }
    }
  }

  /**
   * Fetch available models from the endpoint
   */
  async fetchModels(): Promise<ModelInfo[]> {
    try {
      const headers: Record<string, string> = {
        ...this.config.customHeaders,
      };

      if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }

      const response = await fetch(`${this.baseUrl}/models`, { headers });

      if (!response.ok) {
        return this.supportedModels;
      }

      const data = await response.json();
      const models = data.data || [];

      return models.map((m: any) => ({
        id: m.id,
        name: m.id,
        contextWindow: m.context_length || 8192,
        inputCostPer1kTokens: 0,
        outputCostPer1kTokens: 0,
        maxOutputTokens: 4096,
        supportsStreaming: true,
        supportsVision: false,
        supportsFunctionCalling: false,
      }));
    } catch {
      return this.supportedModels;
    }
  }

  estimateCost(
    request: ChatCompletionRequest,
    estimatedOutputTokens = 500
  ): CostEstimate {
    const modelInfo = this.getModelInfo(request.model);

    if (!modelInfo) {
      return {
        inputCost: 0,
        outputCost: 0,
        totalCost: 0,
        inputTokens: 0,
        estimatedOutputTokens,
      };
    }

    const inputTokens = this.countTokens(
      request.messages.map((m) =>
        typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
      ).join('\n')
    );

    const inputCost = (inputTokens / 1000) * modelInfo.inputCostPer1kTokens;
    const outputCost = (estimatedOutputTokens / 1000) * modelInfo.outputCostPer1kTokens;

    return {
      inputCost,
      outputCost,
      totalCost: inputCost + outputCost,
      inputTokens,
      estimatedOutputTokens,
    };
  }

  countTokens(text: string): number {
    return estimateTokenCount(text);
  }

  private transformRequest(request: ChatCompletionRequest): Record<string, unknown> {
    return {
      model: request.model,
      messages: request.messages.map((m) => ({
        role: m.role,
        content: m.content,
        name: m.name,
      })),
      temperature: request.temperature,
      top_p: request.topP,
      n: request.n,
      stream: request.stream,
      stop: request.stop,
      max_tokens: request.maxTokens,
      presence_penalty: request.presencePenalty,
      frequency_penalty: request.frequencyPenalty,
    };
  }

  private transformResponse(data: Record<string, unknown>): ChatCompletionResponse {
    const choices = (data.choices as any[]) || [];
    const usage = data.usage as Record<string, number> | undefined;

    return {
      id: (data.id as string) || this.generateRequestId(),
      object: 'chat.completion',
      created: (data.created as number) || Math.floor(Date.now() / 1000),
      model: data.model as string,
      choices: choices.map((choice) => ({
        index: choice.index,
        message: {
          role: choice.message.role,
          content: choice.message.content,
        },
        finishReason: choice.finish_reason,
        logprobs: choice.logprobs,
      })),
      usage: {
        promptTokens: usage?.prompt_tokens || 0,
        completionTokens: usage?.completion_tokens || 0,
        totalTokens: usage?.total_tokens || 0,
      },
    };
  }

  private transformChunk(data: Record<string, unknown>): ChatCompletionChunk {
    const choices = (data.choices as any[]) || [];

    return {
      id: (data.id as string) || this.generateRequestId(),
      object: 'chat.completion.chunk',
      created: (data.created as number) || Math.floor(Date.now() / 1000),
      model: data.model as string,
      choices: choices.map((choice) => ({
        index: choice.index,
        delta: {
          role: choice.delta?.role,
          content: choice.delta?.content,
        },
        finishReason: choice.finish_reason,
      })),
      usage: data.usage as any,
    };
  }

  private async parseError(response: Response): Promise<ProviderError> {
    try {
      const data = await response.json();
      const error = data.error || {};

      const isRateLimited = response.status === 429;
      const retryAfter = isRateLimited
        ? parseInt(response.headers.get('retry-after') || '60', 10)
        : undefined;

      return {
        code: error.code || `HTTP_${response.status}`,
        message: error.message || response.statusText,
        statusCode: response.status,
        isRetryable: response.status >= 500 || isRateLimited,
        isRateLimited,
        retryAfter,
      };
    } catch {
      return {
        code: `HTTP_${response.status}`,
        message: response.statusText,
        statusCode: response.status,
        isRetryable: response.status >= 500,
        isRateLimited: response.status === 429,
      };
    }
  }
}
