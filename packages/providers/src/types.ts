/**
 * ClawAI Gateway - Provider Types
 */

import type {
  ChatCompletionResponse,
  ChatCompletionChunk,
  ProviderType,
} from '@clawai/shared-types';

export interface ProviderConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
  defaultModel?: string;
  customHeaders?: Record<string, string>;
}

export interface CompletionOptions {
  signal?: AbortSignal;
  onChunk?: (chunk: ChatCompletionChunk) => void;
}

export interface ProviderResult {
  success: boolean;
  response?: ChatCompletionResponse;
  error?: ProviderError;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

export interface StreamResult {
  success: boolean;
  stream?: AsyncIterable<ChatCompletionChunk>;
  error?: ProviderError;
}

export interface ProviderError {
  code: string;
  message: string;
  statusCode?: number;
  isRetryable: boolean;
  isRateLimited: boolean;
  retryAfter?: number;
}

export interface CostEstimate {
  inputCost: number;
  outputCost: number;
  totalCost: number;
  inputTokens: number;
  estimatedOutputTokens: number;
}

export interface ModelInfo {
  id: string;
  name: string;
  contextWindow: number;
  inputCostPer1kTokens: number;
  outputCostPer1kTokens: number;
  maxOutputTokens?: number;
  supportsStreaming: boolean;
  supportsVision: boolean;
  supportsFunctionCalling: boolean;
}

export interface ProviderHealthStatus {
  healthy: boolean;
  latencyMs?: number;
  errorMessage?: string;
  lastChecked: Date;
}

export type ProviderEventType =
  | 'request_start'
  | 'request_success'
  | 'request_error'
  | 'rate_limited'
  | 'stream_start'
  | 'stream_chunk'
  | 'stream_end';

export interface ProviderEvent {
  type: ProviderEventType;
  provider: ProviderType;
  model: string;
  timestamp: Date;
  data?: unknown;
}

export type ProviderEventHandler = (event: ProviderEvent) => void;
