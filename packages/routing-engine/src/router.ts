/**
 * ClawAI Gateway - Smart Router
 * Main routing engine that decides which provider/model to use
 */

import type { ProviderType, RoutingStrategy } from '@clawai/shared-types';
import type { PrismaClient } from '@clawai/database';

import {
  RoutingContext,
  RoutingDecision,
  RouteCandidate,
  ProviderHealth,
  DEFAULT_MODEL_ALIASES,
} from './types.js';
import { KeyManager } from './key-manager.js';
import { ModelResolver } from './model-resolver.js';
import {
  PriorityStrategy,
  RoundRobinStrategy,
  LeastLatencyStrategy,
  LeastCostStrategy,
  WeightedStrategy,
  RandomStrategy,
  RoutingStrategyInterface,
} from './strategies/index.js';

export interface RouterConfig {
  defaultStrategy: RoutingStrategy;
  enableFallback: boolean;
  maxRetries: number;
  healthCheckInterval: number;
}

const DEFAULT_CONFIG: RouterConfig = {
  defaultStrategy: 'PRIORITY',
  enableFallback: true,
  maxRetries: 2,
  healthCheckInterval: 30000,
};

export class Router {
  private config: RouterConfig;
  private keyManager: KeyManager;
  private modelResolver: ModelResolver;
  private strategies: Map<RoutingStrategy, RoutingStrategyInterface>;
  private providerHealth: Map<string, ProviderHealth> = new Map();
  private roundRobinIndex: Map<string, number> = new Map();

  constructor(
    private prisma: PrismaClient,
    config: Partial<RouterConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.keyManager = new KeyManager(prisma);
    this.modelResolver = new ModelResolver(DEFAULT_MODEL_ALIASES);

    // Initialize strategies
    this.strategies = new Map([
      ['PRIORITY', new PriorityStrategy()],
      ['ROUND_ROBIN', new RoundRobinStrategy()],
      ['LEAST_LATENCY', new LeastLatencyStrategy()],
      ['LEAST_COST', new LeastCostStrategy()],
      ['WEIGHTED', new WeightedStrategy()],
      ['RANDOM', new RandomStrategy()],
    ]);
  }

  /**
   * Route a request to the best provider/model
   */
  async route(context: RoutingContext): Promise<RoutingDecision> {
    const { userId, requestedModel } = context;

    // 1. Resolve model alias if needed
    const resolvedTargets = this.modelResolver.resolve(requestedModel);

    // 2. Get user's routing rules
    const rule = await this.getRoutingRule(userId, requestedModel);

    // 3. Get available candidates
    const candidates = await this.getCandidates(userId, resolvedTargets, rule);

    if (candidates.length === 0) {
      throw new Error(`No available providers for model: ${requestedModel}`);
    }

    // 4. Apply routing strategy
    const strategy = rule?.strategy || this.config.defaultStrategy;
    const strategyImpl = this.strategies.get(strategy);

    if (!strategyImpl) {
      throw new Error(`Unknown routing strategy: ${strategy}`);
    }

    const selectedCandidate = strategyImpl.select(candidates, context, {
      roundRobinIndex: this.roundRobinIndex,
      providerHealth: this.providerHealth,
    });

    // 5. Build routing decision
    const alternatives = candidates
      .filter((c) => c.keyId !== selectedCandidate.keyId)
      .slice(0, 3)
      .map((c) => ({
        providerId: c.providerId,
        providerType: c.providerType,
        modelId: c.modelId,
        apiKeyId: c.keyId,
        priority: c.priority,
      }));

    return {
      providerId: selectedCandidate.providerId,
      providerType: selectedCandidate.providerType,
      modelId: selectedCandidate.modelId,
      apiKeyId: selectedCandidate.keyId,
      strategy,
      ruleId: rule?.id,
      reasoning: this.buildReasoning(selectedCandidate, strategy),
      alternatives,
    };
  }

  /**
   * Get next fallback provider after a failure
   */
  async getFallback(
    context: RoutingContext,
    failedProviderIds: string[]
  ): Promise<RoutingDecision | null> {
    if (!this.config.enableFallback) {
      return null;
    }

    const resolvedTargets = this.modelResolver.resolve(context.requestedModel);
    const rule = await this.getRoutingRule(context.userId, context.requestedModel);
    const candidates = await this.getCandidates(context.userId, resolvedTargets, rule);

    // Filter out failed providers
    const availableCandidates = candidates.filter(
      (c) => !failedProviderIds.includes(c.providerId)
    );

    if (availableCandidates.length === 0) {
      return null;
    }

    // Use priority strategy for fallback
    const strategyImpl = this.strategies.get('PRIORITY')!;
    const selectedCandidate = strategyImpl.select(availableCandidates, context, {
      roundRobinIndex: this.roundRobinIndex,
      providerHealth: this.providerHealth,
    });

    return {
      providerId: selectedCandidate.providerId,
      providerType: selectedCandidate.providerType,
      modelId: selectedCandidate.modelId,
      apiKeyId: selectedCandidate.keyId,
      strategy: 'PRIORITY',
      ruleId: rule?.id,
      reasoning: `Fallback after failure of providers: ${failedProviderIds.join(', ')}`,
      alternatives: [],
    };
  }

  /**
   * Mark a provider as unhealthy
   */
  markProviderUnhealthy(providerId: string, error: string): void {
    const health = this.providerHealth.get(providerId) || {
      providerId,
      healthy: true,
      errorRate: 0,
      lastChecked: new Date(),
    };

    health.healthy = false;
    health.lastError = error;
    health.errorRate = Math.min(1, health.errorRate + 0.2);
    health.lastChecked = new Date();

    this.providerHealth.set(providerId, health);
  }

  /**
   * Mark a provider as healthy
   */
  markProviderHealthy(providerId: string, latencyMs: number): void {
    const health = this.providerHealth.get(providerId) || {
      providerId,
      healthy: true,
      errorRate: 0,
      lastChecked: new Date(),
    };

    health.healthy = true;
    health.latencyMs = latencyMs;
    health.errorRate = Math.max(0, health.errorRate - 0.1);
    health.lastChecked = new Date();

    this.providerHealth.set(providerId, health);
  }

  /**
   * Get API key for a provider
   */
  async getApiKey(keyId: string): Promise<string | null> {
    return this.keyManager.getDecryptedKey(keyId);
  }

  /**
   * Mark key as rate limited
   */
  async markKeyRateLimited(keyId: string, resetAfterSeconds: number): Promise<void> {
    await this.keyManager.markRateLimited(keyId, resetAfterSeconds);
  }

  /**
   * Increment key usage
   */
  async incrementKeyUsage(keyId: string): Promise<void> {
    await this.keyManager.incrementUsage(keyId);
  }

  private async getRoutingRule(userId: string, modelPattern: string) {
    return this.prisma.routingRule.findFirst({
      where: {
        userId,
        OR: [
          { modelPattern },
          { modelPattern: '*' },
        ],
        isActive: true,
      },
      include: {
        providers: {
          orderBy: { priority: 'asc' },
        },
      },
      orderBy: { priority: 'desc' },
    });
  }

  private async getCandidates(
    userId: string,
    targets: Array<{ providerType: ProviderType; modelId: string; priority: number; weight: number }>,
    rule: any
  ): Promise<RouteCandidate[]> {
    const candidates: RouteCandidate[] = [];

    // If rule has specific providers, use those
    if (rule?.providers?.length > 0) {
      for (const ruleProvider of rule.providers) {
        const provider = await this.prisma.provider.findUnique({
          where: { id: ruleProvider.providerId },
          include: { keys: { where: { status: 'ACTIVE' } } },
        });

        if (!provider || provider.status !== 'ACTIVE') continue;

        const key = await this.keyManager.getNextAvailableKey(provider.id);
        if (!key) continue;

        candidates.push({
          providerId: provider.id,
          providerType: provider.type as ProviderType,
          modelId: ruleProvider.modelId,
          keyId: key.id,
          score: 100 - ruleProvider.priority,
          weight: ruleProvider.weight,
          priority: ruleProvider.priority,
        });
      }
    }

    // Also check model alias targets
    for (const target of targets) {
      // Find matching provider
      const providers = await this.prisma.provider.findMany({
        where: {
          userId,
          type: target.providerType.toUpperCase() as any,
          status: 'ACTIVE',
        },
        include: { keys: { where: { status: 'ACTIVE' } } },
      });

      for (const provider of providers) {
        // Skip if already added from rule
        if (candidates.some((c) => c.providerId === provider.id && c.modelId === target.modelId)) {
          continue;
        }

        const key = await this.keyManager.getNextAvailableKey(provider.id);
        if (!key) continue;

        const health = this.providerHealth.get(provider.id);
        const healthPenalty = health?.healthy === false ? 50 : 0;

        candidates.push({
          providerId: provider.id,
          providerType: provider.type as ProviderType,
          modelId: target.modelId,
          keyId: key.id,
          score: 100 - target.priority - healthPenalty,
          weight: target.weight,
          priority: target.priority,
          latencyMs: health?.latencyMs,
        });
      }
    }

    return candidates.sort((a, b) => b.score - a.score);
  }

  private buildReasoning(candidate: RouteCandidate, strategy: RoutingStrategy): string {
    const parts = [
      `Selected ${candidate.providerType}/${candidate.modelId}`,
      `using ${strategy} strategy`,
    ];

    if (candidate.latencyMs) {
      parts.push(`(latency: ${candidate.latencyMs}ms)`);
    }

    return parts.join(' ');
  }
}
