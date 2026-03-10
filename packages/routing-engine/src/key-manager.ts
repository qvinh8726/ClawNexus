/**
 * ClawAI Gateway - API Key Manager
 * Manages API key rotation, rate limiting, and health tracking
 */

import type { PrismaClient, ProviderKey } from '@clawai/database';
import { decryptApiKey } from '@clawai/database';

export interface KeyHealth {
  keyId: string;
  healthy: boolean;
  usageCount: number;
  rateLimited: boolean;
  rateLimitResetAt?: Date;
}

export class KeyManager {
  private keyHealthCache: Map<string, KeyHealth> = new Map();

  constructor(private prisma: PrismaClient) {}

  /**
   * Get the next available API key for a provider
   * Uses round-robin with health checks
   */
  async getNextAvailableKey(providerId: string): Promise<ProviderKey | null> {
    // Get all active keys for this provider
    const keys = await this.prisma.providerKey.findMany({
      where: {
        providerId,
        status: 'ACTIVE',
      },
      orderBy: [
        { usageCount: 'asc' },
        { lastUsedAt: 'asc' },
      ],
    });

    if (keys.length === 0) {
      return null;
    }

    // Find first available key (not rate limited)
    for (const key of keys) {
      const health = this.keyHealthCache.get(key.id);

      // Check if rate limit has expired
      if (key.rateLimitResetAt && key.rateLimitResetAt < new Date()) {
        // Rate limit expired, reset status
        await this.prisma.providerKey.update({
          where: { id: key.id },
          data: {
            status: 'ACTIVE',
            rateLimitResetAt: null,
          },
        });
        this.keyHealthCache.delete(key.id);
        return key;
      }

      // Skip if currently rate limited
      if (health?.rateLimited && health.rateLimitResetAt && health.rateLimitResetAt > new Date()) {
        continue;
      }

      // Check daily/monthly limits
      if (key.dailyLimit && key.dailyUsageCount >= key.dailyLimit) {
        continue;
      }
      if (key.monthlyLimit && key.monthlyUsageCount >= key.monthlyLimit) {
        continue;
      }

      return key;
    }

    // All keys are rate limited or exhausted
    return null;
  }

  /**
   * Get decrypted API key
   */
  async getDecryptedKey(keyId: string): Promise<string | null> {
    const key = await this.prisma.providerKey.findUnique({
      where: { id: keyId },
    });

    if (!key) return null;

    try {
      return decryptApiKey(key.encryptedKey);
    } catch (error) {
      console.error(`Failed to decrypt key ${keyId}:`, error);
      return null;
    }
  }

  /**
   * Mark a key as rate limited
   */
  async markRateLimited(keyId: string, resetAfterSeconds: number): Promise<void> {
    const resetAt = new Date(Date.now() + resetAfterSeconds * 1000);

    await this.prisma.providerKey.update({
      where: { id: keyId },
      data: {
        status: 'RATE_LIMITED',
        rateLimitResetAt: resetAt,
      },
    });

    this.keyHealthCache.set(keyId, {
      keyId,
      healthy: false,
      usageCount: 0,
      rateLimited: true,
      rateLimitResetAt: resetAt,
    });
  }

  /**
   * Increment key usage counter
   */
  async incrementUsage(keyId: string): Promise<void> {
    await this.prisma.providerKey.update({
      where: { id: keyId },
      data: {
        usageCount: { increment: 1 },
        dailyUsageCount: { increment: 1 },
        monthlyUsageCount: { increment: 1 },
        lastUsedAt: new Date(),
      },
    });

    // Update cache
    const health = this.keyHealthCache.get(keyId);
    if (health) {
      health.usageCount++;
    }
  }

  /**
   * Reset daily usage for a provider's keys
   */
  async resetDailyUsage(providerId: string): Promise<void> {
    await this.prisma.providerKey.updateMany({
      where: { providerId },
      data: {
        dailyUsageCount: 0,
        lastResetDaily: new Date(),
      },
    });
  }

  /**
   * Reset monthly usage for a provider's keys
   */
  async resetMonthlyUsage(providerId: string): Promise<void> {
    await this.prisma.providerKey.updateMany({
      where: { providerId },
      data: {
        monthlyUsageCount: 0,
        lastResetMonthly: new Date(),
      },
    });
  }

  /**
   * Get health status of all keys for a provider
   */
  async getKeysHealth(providerId: string): Promise<KeyHealth[]> {
    const keys = await this.prisma.providerKey.findMany({
      where: { providerId },
    });

    return keys.map((key) => ({
      keyId: key.id,
      healthy: key.status === 'ACTIVE',
      usageCount: key.usageCount,
      rateLimited: key.status === 'RATE_LIMITED',
      rateLimitResetAt: key.rateLimitResetAt || undefined,
    }));
  }

  /**
   * Clear health cache for a key
   */
  clearCache(keyId: string): void {
    this.keyHealthCache.delete(keyId);
  }

  /**
   * Clear all health cache
   */
  clearAllCache(): void {
    this.keyHealthCache.clear();
  }
}
