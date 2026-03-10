/**
 * ClawAI Gateway - Model Resolver
 * Resolves model aliases to actual provider/model combinations
 */

import type { ProviderType } from '@clawai/shared-types';
import type { ModelAlias, ModelAliasTarget } from './types.js';

export class ModelResolver {
  private aliases: Map<string, ModelAliasTarget[]>;

  constructor(aliases: ModelAlias[]) {
    this.aliases = new Map();

    for (const alias of aliases) {
      this.aliases.set(alias.alias.toLowerCase(), alias.targets);
    }
  }

  /**
   * Resolve a model identifier to provider/model targets
   */
  resolve(modelId: string): ModelAliasTarget[] {
    const lowercaseId = modelId.toLowerCase();

    // Check if it's an alias
    const aliasTargets = this.aliases.get(lowercaseId);
    if (aliasTargets) {
      return [...aliasTargets].sort((a, b) => a.priority - b.priority);
    }

    // Try to parse as provider/model format
    if (modelId.includes('/')) {
      const [provider, model] = modelId.split('/', 2);
      const providerType = this.parseProviderType(provider);

      if (providerType) {
        return [{
          providerType,
          modelId: model,
          priority: 1,
          weight: 1,
        }];
      }
    }

    // Infer provider from model name
    const inferredProvider = this.inferProvider(modelId);

    return [{
      providerType: inferredProvider,
      modelId,
      priority: 1,
      weight: 1,
    }];
  }

  /**
   * Add or update an alias
   */
  setAlias(alias: string, targets: ModelAliasTarget[]): void {
    this.aliases.set(alias.toLowerCase(), targets);
  }

  /**
   * Remove an alias
   */
  removeAlias(alias: string): boolean {
    return this.aliases.delete(alias.toLowerCase());
  }

  /**
   * Get all aliases
   */
  getAliases(): ModelAlias[] {
    return Array.from(this.aliases.entries()).map(([alias, targets]) => ({
      alias,
      targets,
    }));
  }

  /**
   * Check if a string is a known alias
   */
  isAlias(modelId: string): boolean {
    return this.aliases.has(modelId.toLowerCase());
  }

  /**
   * Parse provider type from string
   */
  private parseProviderType(provider: string): ProviderType | null {
    const normalized = provider.toLowerCase();

    const mapping: Record<string, ProviderType> = {
      openai: 'openai',
      anthropic: 'anthropic',
      claude: 'anthropic',
      gemini: 'gemini',
      google: 'gemini',
      local: 'openai-compatible',
      ollama: 'openai-compatible',
      vllm: 'openai-compatible',
    };

    return mapping[normalized] || null;
  }

  /**
   * Infer provider from model name
   */
  private inferProvider(modelId: string): ProviderType {
    const lowercaseId = modelId.toLowerCase();

    // OpenAI models
    if (lowercaseId.startsWith('gpt-') ||
        lowercaseId.includes('davinci') ||
        lowercaseId.includes('turbo')) {
      return 'openai';
    }

    // Anthropic models
    if (lowercaseId.startsWith('claude')) {
      return 'anthropic';
    }

    // Gemini models
    if (lowercaseId.startsWith('gemini') || lowercaseId.includes('palm')) {
      return 'gemini';
    }

    // Common local model patterns
    if (lowercaseId.includes('llama') ||
        lowercaseId.includes('mistral') ||
        lowercaseId.includes('mixtral') ||
        lowercaseId.includes('phi') ||
        lowercaseId.includes('qwen') ||
        lowercaseId.includes('deepseek')) {
      return 'openai-compatible';
    }

    // Default to OpenAI compatible (most common for local models)
    return 'openai-compatible';
  }
}
