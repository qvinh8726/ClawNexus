/**
 * ClawNexus - Provider Factory
 * Factory for creating provider instances
 */

import type { ProviderType } from '@clawnexus/shared-types';
import { BaseProvider } from './base-provider.js';
import { OpenAIProvider } from './openai-provider.js';
import { AnthropicProvider } from './anthropic-provider.js';
import { GeminiProvider } from './gemini-provider.js';
import { OpenAICompatibleProvider, OpenAICompatibleConfig } from './openai-compatible-provider.js';
import type { ProviderConfig } from './types.js';

export interface CreateProviderOptions extends ProviderConfig {
  type: ProviderType;
  name?: string;
}

export class ProviderFactory {
  private static providers: Map<string, BaseProvider> = new Map();

  /**
   * Create a new provider instance
   */
  static create(options: CreateProviderOptions): BaseProvider {
    const { type, name, ...config } = options;

    switch (type) {
      case 'openai':
        return new OpenAIProvider(config);

      case 'anthropic':
        return new AnthropicProvider(config);

      case 'gemini':
        return new GeminiProvider(config);

      case 'openai-compatible':
        return new OpenAICompatibleProvider(
          config as OpenAICompatibleConfig,
          name || 'OpenAI Compatible'
        );

      default:
        throw new Error(`Unknown provider type: ${type}`);
    }
  }

  /**
   * Get or create a cached provider instance
   */
  static getOrCreate(id: string, options: CreateProviderOptions): BaseProvider {
    const existing = this.providers.get(id);

    if (existing) {
      return existing;
    }

    const provider = this.create(options);
    this.providers.set(id, provider);

    return provider;
  }

  /**
   * Remove a cached provider
   */
  static remove(id: string): boolean {
    return this.providers.delete(id);
  }

  /**
   * Clear all cached providers
   */
  static clear(): void {
    this.providers.clear();
  }

  /**
   * Get all cached provider IDs
   */
  static getProviderIds(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Check if a provider is cached
   */
  static has(id: string): boolean {
    return this.providers.has(id);
  }
}

/**
 * Helper function to create a provider
 */
export function createProvider(options: CreateProviderOptions): BaseProvider {
  return ProviderFactory.create(options);
}
