/**
 * ClawAI Gateway - OpenAI Provider
 * Provider implementation for OpenAI API
 */

import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
  ChatMessage,
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

const OPENAI_MODELS: ModelInfo[] = [
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    contextWindow: 128000,
    inputCostPer1kTokens: 0.005,
    outputCostPer1kTokens: 0.015,
    maxOutputTokens: 4096,
    supportsStreaming: true,
    supportsVision: true,
    supportsFunctionCalling: true,
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    contextWindow: 128000,
    inputCostPer1kTokens: 0.00015,
    outputCostPer1kTokens: 0.0006,
    maxOutputTokens: 16384,
    supportsStreaming: true,
    supportsVision: true,
    supportsFunctionCalling: true,
  },
  {
    id: 'gpt-4-turbo',
    name: 'GPT-4 Turbo',
    contextWindow: 128000,
    inputCostPer1kTokens: 0.01,
    outputCostPer1kTokens: 0.03,
    maxOutputTokens: 4096,
    supportsStreaming: true,
    supportsVision: true,
    supportsFunctionCalling: true,
  },
  {
    id: 'gpt-4',
    name: 'GPT-4',
    contextWindow: 8192,
    inputCostPer1kTokens: 0.03,
    outputCostPer1kTokens: 0.06,
    maxOutputTokens: 4096,
    supportsStreaming: true,
    supportsVision: false,
    supportsFunctionCalling: true,
  },
  {
    id: 'gpt-3.5-turbo',
    name: 'GPT-3.5 Turbo',
    contextWindow: 16385,
    inputCostPer1kTokens: 0.0005,
    outputCostPer1kTokens: 0.0015,
    maxOutputTokens: 4096,
    supportsStreaming: true,
    supportsVision: false,
    supportsFunctionCalling: true,
  },
];

export class OpenAIProvider extends BaseProvider {
  readonly providerType: ProviderType = 'openai';
  readonly displayName = 'OpenAI';
  readonly supportedModels = OPENAI_MODELS;

  private readonly baseUrl: string;

  constructor(config: ProviderConfig) {
    super(config);
    this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
  }

  async generateChatCompletion(
    request: ChatCompletionRequest,
    options?: CompletionOptions
  ): Promise<ProviderResult> {
    const startTime = Date.now();
    const modelInfo = this.getModelInfo(request.model);

    this.emit({ type: 'request_start', model: request.model });

    try {
      const response = await this.fetchWithRetry(
        `${this.baseUrl}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.config.apiKey}`,
            ...this.config.customHeaders,
          },
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
      const response = await this.fetchWithRetry(
        `${this.baseUrl}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.config.apiKey}`,
            ...this.config.customHeaders,
          },
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
        // Skip invalid JSON chunks
        continue;
      }
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
        function_call: m.functionCall,
        tool_calls: m.toolCalls,
      })),
      temperature: request.temperature,
      top_p: request.topP,
      n: request.n,
      stream: request.stream,
      stop: request.stop,
      max_tokens: request.maxTokens,
      presence_penalty: request.presencePenalty,
      frequency_penalty: request.frequencyPenalty,
      logit_bias: request.logitBias,
      user: request.user,
      functions: request.functions,
      function_call: request.functionCall,
      tools: request.tools,
      tool_choice: request.toolChoice,
      response_format: request.responseFormat,
      seed: request.seed,
    };
  }

  private transformResponse(data: Record<string, unknown>): ChatCompletionResponse {
    const choices = (data.choices as any[]) || [];
    const usage = data.usage as Record<string, number> | undefined;

    return {
      id: data.id as string,
      object: 'chat.completion',
      created: data.created as number,
      model: data.model as string,
      choices: choices.map((choice) => ({
        index: choice.index,
        message: {
          role: choice.message.role,
          content: choice.message.content,
          functionCall: choice.message.function_call,
          toolCalls: choice.message.tool_calls,
        },
        finishReason: choice.finish_reason,
        logprobs: choice.logprobs,
      })),
      usage: {
        promptTokens: usage?.prompt_tokens || 0,
        completionTokens: usage?.completion_tokens || 0,
        totalTokens: usage?.total_tokens || 0,
      },
      systemFingerprint: data.system_fingerprint as string | undefined,
    };
  }

  private transformChunk(data: Record<string, unknown>): ChatCompletionChunk {
    const choices = (data.choices as any[]) || [];

    return {
      id: data.id as string,
      object: 'chat.completion.chunk',
      created: data.created as number,
      model: data.model as string,
      choices: choices.map((choice) => ({
        index: choice.index,
        delta: {
          role: choice.delta?.role,
          content: choice.delta?.content,
          functionCall: choice.delta?.function_call,
          toolCalls: choice.delta?.tool_calls,
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
