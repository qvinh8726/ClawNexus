/**
 * ClawAI Gateway - Gateway Service
 * Core service for processing AI requests
 */

import { Injectable, Inject, Logger, BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@clawai/database';
import { ProviderFactory, BaseProvider } from '@clawai/providers';
import { Router } from '@clawai/routing-engine';
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
  ProviderType,
} from '@clawai/shared-types';

export interface GatewayRequest extends ChatCompletionRequest {
  userId: string;
}

export interface GatewayResponse {
  response?: ChatCompletionResponse;
  stream?: AsyncIterable<ChatCompletionChunk>;
  metadata: {
    providerId: string;
    providerType: ProviderType;
    modelId: string;
    latencyMs: number;
    inputTokens: number;
    outputTokens: number;
    cost: number;
    cached: boolean;
  };
}

@Injectable()
export class GatewayService {
  private readonly logger = new Logger(GatewayService.name);
  private router: Router;
  private providerCache: Map<string, BaseProvider> = new Map();

  constructor(@Inject('PRISMA_CLIENT') private prisma: PrismaClient) {
    this.router = new Router(prisma);
  }

  async processRequest(request: GatewayRequest): Promise<GatewayResponse> {
    const { userId, stream, ...completionRequest } = request;

    // Route the request
    const decision = await this.router.route({
      userId,
      requestedModel: request.model,
      tokenCount: this.estimateTokens(request),
    });

    this.logger.debug(
      `Routing ${request.model} -> ${decision.providerType}/${decision.modelId} (${decision.reasoning})`,
    );

    // Get or create provider instance
    const provider = await this.getProvider(
      decision.providerId,
      decision.providerType,
      decision.apiKeyId,
    );

    // Update the model in the request
    const actualRequest: ChatCompletionRequest = {
      ...completionRequest,
      model: decision.modelId,
    };

    try {
      if (stream) {
        return this.handleStreamRequest(
          provider,
          actualRequest,
          decision,
          userId,
          request.model,
        );
      } else {
        return this.handleNonStreamRequest(
          provider,
          actualRequest,
          decision,
          userId,
          request.model,
        );
      }
    } catch (error) {
      // Try fallback
      return this.handleFallback(
        request,
        userId,
        [decision.providerId],
        error as Error,
      );
    }
  }

  private async handleNonStreamRequest(
    provider: BaseProvider,
    request: ChatCompletionRequest,
    decision: any,
    userId: string,
    requestedModel: string,
  ): Promise<GatewayResponse> {
    const startTime = Date.now();
    const result = await provider.generateChatCompletion(request);
    const latencyMs = Date.now() - startTime;

    // Log the request
    await this.logRequest({
      userId,
      providerId: decision.providerId,
      providerKeyId: decision.apiKeyId,
      model: decision.modelId,
      requestedModel,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      latencyMs,
      cost: result.cost,
      status: result.success ? 'SUCCESS' : 'ERROR',
      errorMessage: result.error?.message,
      cached: false,
      streamMode: false,
    });

    // Update routing health
    if (result.success) {
      this.router.markProviderHealthy(decision.providerId, latencyMs);
      await this.router.incrementKeyUsage(decision.apiKeyId);
    } else {
      this.router.markProviderUnhealthy(
        decision.providerId,
        result.error?.message || 'Unknown error',
      );

      if (result.error?.isRateLimited) {
        await this.router.markKeyRateLimited(
          decision.apiKeyId,
          result.error.retryAfter || 60,
        );
      }

      throw new BadRequestException(result.error?.message || 'Provider error');
    }

    return {
      response: result.response,
      metadata: {
        providerId: decision.providerId,
        providerType: decision.providerType,
        modelId: decision.modelId,
        latencyMs,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        cost: result.cost,
        cached: false,
      },
    };
  }

  private async handleStreamRequest(
    provider: BaseProvider,
    request: ChatCompletionRequest,
    decision: any,
    userId: string,
    requestedModel: string,
  ): Promise<GatewayResponse> {
    const startTime = Date.now();
    const result = await provider.streamCompletion(request);

    if (!result.success || !result.stream) {
      throw new BadRequestException(result.error?.message || 'Streaming failed');
    }

    // Create wrapped stream that logs on completion
    const wrappedStream = this.wrapStream(
      result.stream,
      decision,
      userId,
      requestedModel,
      startTime,
    );

    return {
      stream: wrappedStream,
      metadata: {
        providerId: decision.providerId,
        providerType: decision.providerType,
        modelId: decision.modelId,
        latencyMs: 0,
        inputTokens: 0,
        outputTokens: 0,
        cost: 0,
        cached: false,
      },
    };
  }

  private async *wrapStream(
    stream: AsyncIterable<ChatCompletionChunk>,
    decision: any,
    userId: string,
    requestedModel: string,
    startTime: number,
  ): AsyncIterable<ChatCompletionChunk> {
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      for await (const chunk of stream) {
        // Track usage if provided
        if (chunk.usage) {
          inputTokens = chunk.usage.promptTokens;
          outputTokens = chunk.usage.completionTokens;
        }
        yield chunk;
      }

      const latencyMs = Date.now() - startTime;

      // Log successful completion
      await this.logRequest({
        userId,
        providerId: decision.providerId,
        providerKeyId: decision.apiKeyId,
        model: decision.modelId,
        requestedModel,
        inputTokens,
        outputTokens,
        latencyMs,
        cost: this.estimateStreamCost(decision.providerType, inputTokens, outputTokens),
        status: 'SUCCESS',
        cached: false,
        streamMode: true,
      });

      this.router.markProviderHealthy(decision.providerId, latencyMs);
      await this.router.incrementKeyUsage(decision.apiKeyId);
    } catch (error) {
      // Log error
      await this.logRequest({
        userId,
        providerId: decision.providerId,
        providerKeyId: decision.apiKeyId,
        model: decision.modelId,
        requestedModel,
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: Date.now() - startTime,
        cost: 0,
        status: 'ERROR',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        cached: false,
        streamMode: true,
      });

      throw error;
    }
  }

  private async handleFallback(
    request: GatewayRequest,
    userId: string,
    failedProviderIds: string[],
    originalError: Error,
  ): Promise<GatewayResponse> {
    const fallback = await this.router.getFallback(
      {
        userId,
        requestedModel: request.model,
        tokenCount: this.estimateTokens(request),
      },
      failedProviderIds,
    );

    if (!fallback) {
      throw new BadRequestException(
        `All providers failed. Last error: ${originalError.message}`,
      );
    }

    this.logger.warn(
      `Falling back to ${fallback.providerType}/${fallback.modelId}`,
    );

    const provider = await this.getProvider(
      fallback.providerId,
      fallback.providerType,
      fallback.apiKeyId,
    );

    const actualRequest: ChatCompletionRequest = {
      ...request,
      model: fallback.modelId,
      stream: false,
    };

    return this.handleNonStreamRequest(
      provider,
      actualRequest,
      fallback,
      userId,
      request.model,
    );
  }

  private async getProvider(
    providerId: string,
    providerType: ProviderType,
    apiKeyId: string,
  ): Promise<BaseProvider> {
    const cacheKey = `${providerId}:${apiKeyId}`;

    if (this.providerCache.has(cacheKey)) {
      return this.providerCache.get(cacheKey)!;
    }

    const apiKey = await this.router.getApiKey(apiKeyId);

    if (!apiKey) {
      throw new BadRequestException('API key not found');
    }

    const dbProvider = await this.prisma.provider.findUnique({
      where: { id: providerId },
    });

    const provider = ProviderFactory.create({
      type: providerType,
      apiKey,
      baseUrl: dbProvider?.baseUrl || undefined,
      name: dbProvider?.name,
    });

    this.providerCache.set(cacheKey, provider);

    return provider;
  }

  private async logRequest(data: {
    userId: string;
    providerId: string;
    providerKeyId: string;
    model: string;
    requestedModel: string;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
    cost: number;
    status: 'SUCCESS' | 'ERROR' | 'TIMEOUT' | 'RATE_LIMITED';
    errorMessage?: string;
    cached: boolean;
    streamMode: boolean;
  }): Promise<void> {
    try {
      await this.prisma.requestLog.create({
        data: {
          userId: data.userId,
          providerId: data.providerId,
          providerKeyId: data.providerKeyId,
          model: data.model,
          requestedModel: data.requestedModel,
          inputTokens: data.inputTokens,
          outputTokens: data.outputTokens,
          totalTokens: data.inputTokens + data.outputTokens,
          latencyMs: data.latencyMs,
          cost: data.cost,
          status: data.status,
          errorMessage: data.errorMessage,
          cached: data.cached,
          streamMode: data.streamMode,
        },
      });
    } catch (error) {
      this.logger.error('Failed to log request', error);
    }
  }

  private estimateTokens(request: ChatCompletionRequest): number {
    const text = request.messages
      .map((m) =>
        typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      )
      .join('\n');

    // Simple estimation: ~4 chars per token
    return Math.ceil(text.length / 4);
  }

  private estimateStreamCost(
    providerType: ProviderType,
    inputTokens: number,
    outputTokens: number,
  ): number {
    // Default cost rates per 1k tokens by provider
    const costTable: Record<string, { input: number; output: number }> = {
      openai: { input: 0.005, output: 0.015 },
      anthropic: { input: 0.003, output: 0.015 },
      gemini: { input: 0.00025, output: 0.0005 },
      'openai-compatible': { input: 0, output: 0 },
    };

    const rates = costTable[providerType] || { input: 0, output: 0 };
    return (inputTokens / 1000) * rates.input + (outputTokens / 1000) * rates.output;
  }

  async getAvailableModels(userId: string): Promise<any[]> {
    const providers = await this.prisma.provider.findMany({
      where: {
        userId,
        status: 'ACTIVE',
      },
      include: {
        keys: {
          where: { status: 'ACTIVE' },
          take: 1,
        },
      },
    });

    const models: any[] = [];

    // Add model aliases
    const aliases = ['smart', 'cheap', 'fast', 'code', 'long_context', 'best'];
    for (const alias of aliases) {
      models.push({
        id: alias,
        object: 'model',
        created: Date.now(),
        owned_by: 'clawai',
      });
    }

    // Add provider models
    const modelConfigs = await this.prisma.modelConfig.findMany({
      where: { isActive: true },
    });

    for (const provider of providers) {
      const providerModels = modelConfigs.filter(
        (m) => m.providerType === provider.type,
      );

      for (const model of providerModels) {
        models.push({
          id: model.modelId,
          object: 'model',
          created: Date.now(),
          owned_by: provider.type.toLowerCase(),
        });
      }
    }

    return models;
  }
}
