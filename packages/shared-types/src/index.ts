/**
 * ClawNexus - Shared Types
 * Core type definitions used across the entire platform
 */

// ============================================
// Provider Types
// ============================================

export type ProviderType = 'openai' | 'anthropic' | 'gemini' | 'openai-compatible';

export type ProviderStatus = 'active' | 'inactive' | 'error' | 'rate_limited';

export interface Provider {
  id: string;
  name: string;
  type: ProviderType;
  baseUrl?: string;
  status: ProviderStatus;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
  config?: ProviderConfig;
}

export interface ProviderConfig {
  maxRetries?: number;
  timeout?: number;
  defaultModel?: string;
  customHeaders?: Record<string, string>;
}

export interface ProviderKey {
  id: string;
  providerId: string;
  keyAlias: string;
  encryptedKey: string;
  status: 'active' | 'inactive' | 'rate_limited' | 'exhausted';
  lastUsedAt?: Date;
  rateLimitResetAt?: Date;
  usageCount: number;
  dailyLimit?: number;
  monthlyLimit?: number;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// Model Types
// ============================================

export interface ModelInfo {
  id: string;
  name: string;
  provider: ProviderType;
  contextWindow: number;
  inputCostPer1kTokens: number;
  outputCostPer1kTokens: number;
  capabilities: ModelCapability[];
  maxOutputTokens?: number;
  supportsStreaming: boolean;
  supportsVision: boolean;
  supportsFunctionCalling: boolean;
}

export type ModelCapability =
  | 'chat'
  | 'completion'
  | 'embedding'
  | 'vision'
  | 'function_calling'
  | 'json_mode'
  | 'code'
  | 'reasoning';

export type ModelAlias = 'smart' | 'cheap' | 'fast' | 'code' | 'long_context' | 'best';

export interface ModelMapping {
  alias: ModelAlias;
  providerId: string;
  modelId: string;
  priority: number;
}

// ============================================
// Chat Completion Types (OpenAI Compatible)
// ============================================

export type ChatRole = 'system' | 'user' | 'assistant' | 'function' | 'tool';

export interface ChatMessage {
  role: ChatRole;
  content: string | ContentPart[];
  name?: string;
  functionCall?: FunctionCall;
  toolCalls?: ToolCall[];
}

export interface ContentPart {
  type: 'text' | 'image_url';
  text?: string;
  imageUrl?: {
    url: string;
    detail?: 'auto' | 'low' | 'high';
  };
}

export interface FunctionCall {
  name: string;
  arguments: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: FunctionCall;
}

export interface FunctionDefinition {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
}

export interface Tool {
  type: 'function';
  function: FunctionDefinition;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  topP?: number;
  n?: number;
  stream?: boolean;
  stop?: string | string[];
  maxTokens?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  logitBias?: Record<string, number>;
  user?: string;
  functions?: FunctionDefinition[];
  functionCall?: 'none' | 'auto' | { name: string };
  tools?: Tool[];
  toolChoice?: 'none' | 'auto' | 'required' | { type: 'function'; function: { name: string } };
  responseFormat?: { type: 'text' | 'json_object' };
  seed?: number;
}

export interface ChatCompletionChoice {
  index: number;
  message: ChatMessage;
  finishReason: 'stop' | 'length' | 'function_call' | 'tool_calls' | 'content_filter' | null;
  logprobs?: unknown;
}

export interface ChatCompletionUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage: ChatCompletionUsage;
  systemFingerprint?: string;
}

// Streaming types
export interface ChatCompletionChunkDelta {
  role?: ChatRole;
  content?: string;
  functionCall?: Partial<FunctionCall>;
  toolCalls?: Partial<ToolCall>[];
}

export interface ChatCompletionChunkChoice {
  index: number;
  delta: ChatCompletionChunkDelta;
  finishReason: 'stop' | 'length' | 'function_call' | 'tool_calls' | 'content_filter' | null;
}

export interface ChatCompletionChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: ChatCompletionChunkChoice[];
  usage?: ChatCompletionUsage;
}

// ============================================
// Routing Types
// ============================================

export type RoutingStrategy =
  | 'round_robin'
  | 'least_latency'
  | 'least_cost'
  | 'priority'
  | 'random'
  | 'weighted';

export interface RoutingRule {
  id: string;
  name: string;
  description?: string;
  modelPattern: string;
  strategy: RoutingStrategy;
  providers: RoutingRuleProvider[];
  conditions?: RoutingCondition[];
  fallbackEnabled: boolean;
  retryCount: number;
  isActive: boolean;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoutingRuleProvider {
  providerId: string;
  modelId: string;
  weight: number;
  priority: number;
}

export interface RoutingCondition {
  type: 'token_count' | 'time_of_day' | 'user_tier' | 'request_type';
  operator: 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'in' | 'not_in';
  value: string | number | string[];
}

export interface RoutingDecision {
  providerId: string;
  providerType: ProviderType;
  modelId: string;
  apiKeyId: string;
  strategy: RoutingStrategy;
  ruleId?: string;
  reasoning: string;
}

// ============================================
// Request & Logging Types
// ============================================

export type RequestStatus = 'pending' | 'success' | 'error' | 'timeout' | 'rate_limited';

export interface RequestLog {
  id: string;
  userId?: string;
  providerId: string;
  providerType: ProviderType;
  model: string;
  requestedModel: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
  cost: number;
  status: RequestStatus;
  errorMessage?: string;
  errorCode?: string;
  cached: boolean;
  streamMode: boolean;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface RequestLogFilter {
  userId?: string;
  providerId?: string;
  model?: string;
  status?: RequestStatus;
  startDate?: Date;
  endDate?: Date;
  minLatency?: number;
  maxLatency?: number;
  cached?: boolean;
}

// ============================================
// Usage & Analytics Types
// ============================================

export interface UsageMetrics {
  id: string;
  userId?: string;
  providerId?: string;
  period: 'hourly' | 'daily' | 'weekly' | 'monthly';
  periodStart: Date;
  periodEnd: Date;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  totalCost: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  cacheHits: number;
  cacheMisses: number;
}

export interface CostBreakdown {
  providerId: string;
  providerName: string;
  totalCost: number;
  inputCost: number;
  outputCost: number;
  requestCount: number;
  tokenCount: number;
  percentage: number;
}

export interface UsageSummary {
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  avgLatencyMs: number;
  successRate: number;
  cacheHitRate: number;
  costBreakdown: CostBreakdown[];
  topModels: Array<{ model: string; count: number; cost: number }>;
}

// ============================================
// User & Authentication Types
// ============================================

export type UserRole = 'admin' | 'user' | 'viewer';

export interface User {
  id: string;
  email: string;
  name?: string;
  role: UserRole;
  apiKey?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
}

export interface AuthPayload {
  userId: string;
  email: string;
  role: UserRole;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: Omit<User, 'apiKey'>;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name?: string;
}

// ============================================
// API Response Types
// ============================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: ApiMeta;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiMeta {
  page?: number;
  pageSize?: number;
  total?: number;
  totalPages?: number;
}

export interface PaginationParams {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// ============================================
// Event Types
// ============================================

export type EventType =
  | 'request.started'
  | 'request.completed'
  | 'request.failed'
  | 'provider.added'
  | 'provider.updated'
  | 'provider.removed'
  | 'key.rotated'
  | 'key.rate_limited'
  | 'routing.changed';

export interface GatewayEvent {
  type: EventType;
  timestamp: Date;
  payload: Record<string, unknown>;
}

// ============================================
// Configuration Types
// ============================================

export interface GatewayConfig {
  rateLimiting: {
    enabled: boolean;
    windowMs: number;
    maxRequests: number;
  };
  caching: {
    enabled: boolean;
    ttlSeconds: number;
    maxSize: number;
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    format: 'json' | 'pretty';
    includeBody: boolean;
  };
  security: {
    requireAuth: boolean;
    allowedOrigins: string[];
  };
}
