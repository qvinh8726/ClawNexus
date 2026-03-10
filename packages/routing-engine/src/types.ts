/**
 * ClawNexus - Routing Engine Types
 */

import type { ProviderType, RoutingStrategy } from '@clawnexus/shared-types';

export interface RoutingContext {
  userId: string;
  requestedModel: string;
  tokenCount: number;
  userTier?: string;
  requestType?: 'chat' | 'completion' | 'embedding';
  metadata?: Record<string, unknown>;
}

export interface RoutingDecision {
  providerId: string;
  providerType: ProviderType;
  modelId: string;
  apiKeyId: string;
  strategy: RoutingStrategy;
  ruleId?: string;
  reasoning: string;
  alternatives: RoutingAlternative[];
}

export interface RoutingAlternative {
  providerId: string;
  providerType: ProviderType;
  modelId: string;
  apiKeyId: string;
  priority: number;
}

export interface ProviderHealth {
  providerId: string;
  healthy: boolean;
  latencyMs?: number;
  errorRate: number;
  lastError?: string;
  lastChecked: Date;
}

export interface KeyHealth {
  keyId: string;
  providerId?: string;
  healthy: boolean;
  usageCount: number;
  rateLimited: boolean;
  rateLimitResetAt?: Date;
  lastUsed?: Date;
}

export interface RouteCandidate {
  providerId: string;
  providerType: ProviderType;
  modelId: string;
  keyId: string;
  score: number;
  weight: number;
  priority: number;
  latencyMs?: number;
  costPer1kTokens?: number;
}

export interface ModelAlias {
  alias: string;
  targets: ModelAliasTarget[];
}

export interface ModelAliasTarget {
  providerType: ProviderType;
  modelId: string;
  priority: number;
  weight: number;
}

export const DEFAULT_MODEL_ALIASES: ModelAlias[] = [
  {
    alias: 'smart',
    targets: [
      { providerType: 'openai', modelId: 'gpt-4o', priority: 1, weight: 1 },
      { providerType: 'anthropic', modelId: 'claude-3-5-sonnet-20241022', priority: 2, weight: 1 },
      { providerType: 'gemini', modelId: 'gemini-1.5-pro', priority: 3, weight: 1 },
    ],
  },
  {
    alias: 'best',
    targets: [
      { providerType: 'anthropic', modelId: 'claude-3-opus-20240229', priority: 1, weight: 1 },
      { providerType: 'openai', modelId: 'gpt-4-turbo', priority: 2, weight: 1 },
    ],
  },
  {
    alias: 'cheap',
    targets: [
      { providerType: 'gemini', modelId: 'gemini-1.5-flash', priority: 1, weight: 2 },
      { providerType: 'openai', modelId: 'gpt-4o-mini', priority: 2, weight: 2 },
      { providerType: 'anthropic', modelId: 'claude-3-haiku-20240307', priority: 3, weight: 1 },
    ],
  },
  {
    alias: 'fast',
    targets: [
      { providerType: 'gemini', modelId: 'gemini-2.0-flash-exp', priority: 1, weight: 2 },
      { providerType: 'openai', modelId: 'gpt-4o-mini', priority: 2, weight: 2 },
      { providerType: 'anthropic', modelId: 'claude-3-5-haiku-20241022', priority: 3, weight: 1 },
    ],
  },
  {
    alias: 'code',
    targets: [
      { providerType: 'anthropic', modelId: 'claude-3-5-sonnet-20241022', priority: 1, weight: 2 },
      { providerType: 'openai', modelId: 'gpt-4o', priority: 2, weight: 1 },
    ],
  },
  {
    alias: 'long_context',
    targets: [
      { providerType: 'gemini', modelId: 'gemini-1.5-pro', priority: 1, weight: 2 },
      { providerType: 'anthropic', modelId: 'claude-3-5-sonnet-20241022', priority: 2, weight: 1 },
    ],
  },
];
