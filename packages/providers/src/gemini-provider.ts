/**
 * ClawAI Gateway - Google Gemini Provider
 * Provider implementation for Google Gemini API
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
import { estimateTokenCount } from './utils/token-counter.js';

const GEMINI_MODELS: ModelInfo[] = [
  {
    id: 'gemini-2.0-flash-exp',
    name: 'Gemini 2.0 Flash',
    contextWindow: 1000000,
    inputCostPer1kTokens: 0.0001,
    outputCostPer1kTokens: 0.0004,
    maxOutputTokens: 8192,
    supportsStreaming: true,
    supportsVision: true,
    supportsFunctionCalling: true,
  },
  {
    id: 'gemini-1.5-pro',
    name: 'Gemini 1.5 Pro',
    contextWindow: 2000000,
    inputCostPer1kTokens: 0.00125,
    outputCostPer1kTokens: 0.005,
    maxOutputTokens: 8192,
    supportsStreaming: true,
    supportsVision: true,
    supportsFunctionCalling: true,
  },
  {
    id: 'gemini-1.5-flash',
    name: 'Gemini 1.5 Flash',
    contextWindow: 1000000,
    inputCostPer1kTokens: 0.000075,
    outputCostPer1kTokens: 0.0003,
    maxOutputTokens: 8192,
    supportsStreaming: true,
    supportsVision: true,
    supportsFunctionCalling: true,
  },
  {
    id: 'gemini-1.5-flash-8b',
    name: 'Gemini 1.5 Flash 8B',
    contextWindow: 1000000,
    inputCostPer1kTokens: 0.0000375,
    outputCostPer1kTokens: 0.00015,
    maxOutputTokens: 8192,
    supportsStreaming: true,
    supportsVision: true,
    supportsFunctionCalling: true,
  },
];

export class GeminiProvider extends BaseProvider {
  readonly providerType: ProviderType = 'gemini';
  readonly displayName = 'Google Gemini';
  readonly supportedModels = GEMINI_MODELS;

  private readonly baseUrl: string;

  constructor(config: ProviderConfig) {
    super(config);
    this.baseUrl = config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
  }

  async generateChatCompletion(
    request: ChatCompletionRequest,
    options?: CompletionOptions
  ): Promise<ProviderResult> {
    const startTime = Date.now();
    const modelInfo = this.getModelInfo(request.model);

    this.emit({ type: 'request_start', model: request.model });

    try {
      const url = `${this.baseUrl}/models/${request.model}:generateContent?key=${this.config.apiKey}`;

      const response = await this.fetchWithRetry(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
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
      const url = `${this.baseUrl}/models/${request.model}:streamGenerateContent?key=${this.config.apiKey}&alt=sse`;

      const response = await this.fetchWithRetry(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...this.config.customHeaders,
          },
          body: JSON.stringify(this.transformRequest(request)),
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
    const requestId = this.generateRequestId();
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          this.emit({ type: 'stream_end', model });
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6).trim();

            if (!jsonStr) continue;

            try {
              const data = JSON.parse(jsonStr);

              if (data.candidates?.[0]?.content?.parts) {
                const text = data.candidates[0].content.parts
                  .filter((p: any) => p.text)
                  .map((p: any) => p.text)
                  .join('');

                if (text) {
                  const chunk: ChatCompletionChunk = {
                    id: requestId,
                    object: 'chat.completion.chunk',
                    created: Math.floor(Date.now() / 1000),
                    model,
                    choices: [{
                      index: 0,
                      delta: {
                        content: text,
                      },
                      finishReason: this.mapFinishReason(data.candidates[0].finishReason),
                    }],
                    usage: data.usageMetadata ? {
                      promptTokens: data.usageMetadata.promptTokenCount || 0,
                      completionTokens: data.usageMetadata.candidatesTokenCount || 0,
                      totalTokens: data.usageMetadata.totalTokenCount || 0,
                    } : undefined,
                  };

                  this.emit({ type: 'stream_chunk', model, data: chunk });

                  if (options?.onChunk) {
                    options.onChunk(chunk);
                  }

                  yield chunk;
                }
              }
            } catch (e) {
              // Skip invalid JSON
              continue;
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
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
    // Extract system instruction
    const systemMessage = request.messages.find((m) => m.role === 'system');
    const otherMessages = request.messages.filter((m) => m.role !== 'system');

    // Transform messages to Gemini format
    const contents = otherMessages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: this.transformContent(m.content),
    }));

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: request.temperature,
        topP: request.topP,
        maxOutputTokens: request.maxTokens,
        stopSequences: request.stop
          ? (Array.isArray(request.stop) ? request.stop : [request.stop])
          : undefined,
      },
    };

    if (systemMessage) {
      body.systemInstruction = {
        parts: [{
          text: typeof systemMessage.content === 'string'
            ? systemMessage.content
            : JSON.stringify(systemMessage.content)
        }],
      };
    }

    // Handle tools/functions
    if (request.tools && request.tools.length > 0) {
      body.tools = [{
        functionDeclarations: request.tools.map((tool) => ({
          name: tool.function.name,
          description: tool.function.description,
          parameters: tool.function.parameters,
        })),
      }];
    }

    return body;
  }

  private transformContent(content: string | Array<{ type: string; text?: string; imageUrl?: { url: string } }>): Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> {
    if (typeof content === 'string') {
      return [{ text: content }];
    }

    return content.map((part) => {
      if (part.type === 'text') {
        return { text: part.text };
      }
      if (part.type === 'image_url' && part.imageUrl) {
        const url = part.imageUrl.url;
        if (url.startsWith('data:')) {
          const [mediaType, base64Data] = url.split(',');
          const mimeType = mediaType.split(':')[1].split(';')[0];
          return {
            inlineData: {
              mimeType,
              data: base64Data,
            },
          };
        }
        // For URLs, we'd need to fetch the image first
        // For simplicity, return empty - production would handle this
        return { text: `[Image: ${url}]` };
      }
      return { text: JSON.stringify(part) };
    });
  }

  private transformResponse(data: Record<string, unknown>, requestModel: string): ChatCompletionResponse {
    const candidates = (data.candidates as any[]) || [];
    const usageMetadata = data.usageMetadata as Record<string, number> | undefined;

    const firstCandidate = candidates[0];
    const content = firstCandidate?.content?.parts
      ?.filter((p: any) => p.text)
      .map((p: any) => p.text)
      .join('') || '';

    return {
      id: this.generateRequestId(),
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: requestModel,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content,
        },
        finishReason: this.mapFinishReason(firstCandidate?.finishReason),
        logprobs: null,
      }],
      usage: {
        promptTokens: usageMetadata?.promptTokenCount || 0,
        completionTokens: usageMetadata?.candidatesTokenCount || 0,
        totalTokens: usageMetadata?.totalTokenCount || 0,
      },
    };
  }

  private mapFinishReason(reason: string | undefined): 'stop' | 'length' | 'function_call' | null {
    switch (reason) {
      case 'STOP':
        return 'stop';
      case 'MAX_TOKENS':
        return 'length';
      case 'FUNCTION_CALL':
        return 'function_call';
      default:
        return null;
    }
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
