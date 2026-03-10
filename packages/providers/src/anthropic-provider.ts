/**
 * ClawAI Gateway - Anthropic Provider
 * Provider implementation for Anthropic Claude API
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

const ANTHROPIC_MODELS: ModelInfo[] = [
  {
    id: 'claude-3-5-sonnet-20241022',
    name: 'Claude 3.5 Sonnet',
    contextWindow: 200000,
    inputCostPer1kTokens: 0.003,
    outputCostPer1kTokens: 0.015,
    maxOutputTokens: 8192,
    supportsStreaming: true,
    supportsVision: true,
    supportsFunctionCalling: true,
  },
  {
    id: 'claude-3-5-haiku-20241022',
    name: 'Claude 3.5 Haiku',
    contextWindow: 200000,
    inputCostPer1kTokens: 0.001,
    outputCostPer1kTokens: 0.005,
    maxOutputTokens: 8192,
    supportsStreaming: true,
    supportsVision: true,
    supportsFunctionCalling: true,
  },
  {
    id: 'claude-3-opus-20240229',
    name: 'Claude 3 Opus',
    contextWindow: 200000,
    inputCostPer1kTokens: 0.015,
    outputCostPer1kTokens: 0.075,
    maxOutputTokens: 4096,
    supportsStreaming: true,
    supportsVision: true,
    supportsFunctionCalling: true,
  },
  {
    id: 'claude-3-sonnet-20240229',
    name: 'Claude 3 Sonnet',
    contextWindow: 200000,
    inputCostPer1kTokens: 0.003,
    outputCostPer1kTokens: 0.015,
    maxOutputTokens: 4096,
    supportsStreaming: true,
    supportsVision: true,
    supportsFunctionCalling: true,
  },
  {
    id: 'claude-3-haiku-20240307',
    name: 'Claude 3 Haiku',
    contextWindow: 200000,
    inputCostPer1kTokens: 0.00025,
    outputCostPer1kTokens: 0.00125,
    maxOutputTokens: 4096,
    supportsStreaming: true,
    supportsVision: true,
    supportsFunctionCalling: true,
  },
];

const ANTHROPIC_VERSION = '2023-06-01';

export class AnthropicProvider extends BaseProvider {
  readonly providerType: ProviderType = 'anthropic';
  readonly displayName = 'Anthropic';
  readonly supportedModels = ANTHROPIC_MODELS;

  private readonly baseUrl: string;

  constructor(config: ProviderConfig) {
    super(config);
    this.baseUrl = config.baseUrl || 'https://api.anthropic.com/v1';
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
        `${this.baseUrl}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.config.apiKey,
            'anthropic-version': ANTHROPIC_VERSION,
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

      const data = await response.json() as Record<string, unknown>;
      const completionResponse = this.transformResponse(data, request.model);

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
        `${this.baseUrl}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.config.apiKey,
            'anthropic-version': ANTHROPIC_VERSION,
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
    let inputTokens = 0;
    let outputTokens = 0;
    const requestId = this.generateRequestId();

    for await (const chunk of parseSSEStream(body)) {
      try {
        const data = JSON.parse(chunk);

        // Handle different event types
        if (data.type === 'message_start') {
          inputTokens = data.message?.usage?.input_tokens || 0;
          continue;
        }

        if (data.type === 'message_delta') {
          outputTokens = data.usage?.output_tokens || outputTokens;

          if (data.delta?.stop_reason) {
            const finalChunk: ChatCompletionChunk = {
              id: requestId,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model,
              choices: [{
                index: 0,
                delta: {},
                finishReason: this.mapStopReason(data.delta.stop_reason),
              }],
              usage: {
                promptTokens: inputTokens,
                completionTokens: outputTokens,
                totalTokens: inputTokens + outputTokens,
              },
            };

            this.emit({ type: 'stream_end', model });

            if (options?.onChunk) {
              options.onChunk(finalChunk);
            }

            yield finalChunk;
            continue;
          }
        }

        if (data.type === 'content_block_delta' && data.delta?.text) {
          const transformedChunk: ChatCompletionChunk = {
            id: requestId,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model,
            choices: [{
              index: 0,
              delta: {
                content: data.delta.text,
              },
              finishReason: null,
            }],
          };

          this.emit({ type: 'stream_chunk', model, data: transformedChunk });

          if (options?.onChunk) {
            options.onChunk(transformedChunk);
          }

          yield transformedChunk;
        }
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
    // Anthropic uses a similar tokenization to OpenAI
    return estimateTokenCount(text);
  }

  private transformRequest(request: ChatCompletionRequest): Record<string, unknown> {
    // Extract system message
    const systemMessage = request.messages.find((m) => m.role === 'system');
    const otherMessages = request.messages.filter((m) => m.role !== 'system');

    // Transform messages to Anthropic format
    const messages = otherMessages.map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: this.transformContent(m.content),
    }));

    const body: Record<string, unknown> = {
      model: request.model,
      messages,
      max_tokens: request.maxTokens || 4096,
    };

    if (systemMessage) {
      body.system = typeof systemMessage.content === 'string'
        ? systemMessage.content
        : JSON.stringify(systemMessage.content);
    }

    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    }

    if (request.topP !== undefined) {
      body.top_p = request.topP;
    }

    if (request.stop) {
      body.stop_sequences = Array.isArray(request.stop) ? request.stop : [request.stop];
    }

    // Handle tools/functions
    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools.map((tool) => ({
        name: tool.function.name,
        description: tool.function.description,
        input_schema: tool.function.parameters,
      }));
    }

    return body;
  }

  private transformContent(content: string | Array<{ type: string; text?: string; imageUrl?: { url: string } }>): unknown {
    if (typeof content === 'string') {
      return content;
    }

    return content.map((part) => {
      if (part.type === 'text') {
        return { type: 'text', text: part.text };
      }
      if (part.type === 'image_url' && part.imageUrl) {
        // Handle base64 or URL images
        const url = part.imageUrl.url;
        if (url.startsWith('data:')) {
          const [mediaType, base64Data] = url.split(',');
          const type = mediaType.split(':')[1].split(';')[0];
          return {
            type: 'image',
            source: {
              type: 'base64',
              media_type: type,
              data: base64Data,
            },
          };
        }
        return {
          type: 'image',
          source: {
            type: 'url',
            url,
          },
        };
      }
      return part;
    });
  }

  private transformResponse(data: Record<string, unknown>, requestModel: string): ChatCompletionResponse {
    const content = (data.content as any[]) || [];
    const usage = data.usage as Record<string, number> | undefined;

    // Combine all text content
    const textContent = content
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('');

    return {
      id: data.id as string,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: (data.model as string) || requestModel,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: textContent,
        },
        finishReason: this.mapStopReason(data.stop_reason as string),
        logprobs: null,
      }],
      usage: {
        promptTokens: usage?.input_tokens || 0,
        completionTokens: usage?.output_tokens || 0,
        totalTokens: (usage?.input_tokens || 0) + (usage?.output_tokens || 0),
      },
    };
  }

  private mapStopReason(reason: string | undefined): 'stop' | 'length' | 'function_call' | 'tool_calls' | null {
    switch (reason) {
      case 'end_turn':
        return 'stop';
      case 'max_tokens':
        return 'length';
      case 'tool_use':
        return 'tool_calls';
      default:
        return null;
    }
  }

  private async parseError(response: Response): Promise<ProviderError> {
    try {
      const data = await response.json() as Record<string, unknown>;
      const error = (data.error || {}) as Record<string, unknown>;

      const isRateLimited = response.status === 429;
      const retryAfter = isRateLimited
        ? parseInt(response.headers.get('retry-after') || '60', 10)
        : undefined;

      return {
        code: (error.type as string) || `HTTP_${response.status}`,
        message: (error.message as string) || response.statusText,
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
