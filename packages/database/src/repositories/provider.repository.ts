/**
 * ClawAI Gateway - Provider Repository
 */

import {
  PrismaClient,
  Provider,
  ProviderKey,
  ProviderType,
  ProviderStatus,
  KeyStatus
} from '@prisma/client';
import { encryptApiKey, decryptApiKey, extractKeyPrefix } from '../encryption.js';

export class ProviderRepository {
  constructor(private prisma: PrismaClient) {}

  // Provider Methods
  async findById(id: string): Promise<Provider | null> {
    return this.prisma.provider.findUnique({
      where: { id },
      include: { keys: true },
    });
  }

  async findByUserId(userId: string): Promise<Provider[]> {
    return this.prisma.provider.findMany({
      where: { userId },
      include: { keys: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findActiveByType(userId: string, type: ProviderType): Promise<Provider[]> {
    return this.prisma.provider.findMany({
      where: {
        userId,
        type,
        status: 'ACTIVE',
      },
      include: {
        keys: {
          where: { status: 'ACTIVE' },
        },
      },
    });
  }

  async create(data: {
    userId: string;
    name: string;
    type: ProviderType;
    baseUrl?: string;
    isDefault?: boolean;
    config?: Record<string, unknown>;
  }): Promise<Provider> {
    return this.prisma.provider.create({
      data: {
        ...data,
        config: data.config as any,
      },
      include: { keys: true },
    });
  }

  async update(id: string, data: Partial<Omit<Provider, 'id' | 'createdAt' | 'userId'>>): Promise<Provider> {
    return this.prisma.provider.update({
      where: { id },
      data: data as any,
      include: { keys: true },
    });
  }

  async updateStatus(id: string, status: ProviderStatus): Promise<void> {
    await this.prisma.provider.update({
      where: { id },
      data: { status },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.provider.delete({
      where: { id },
    });
  }

  // Provider Key Methods
  async findKeyById(id: string): Promise<ProviderKey | null> {
    return this.prisma.providerKey.findUnique({
      where: { id },
    });
  }

  async findActiveKeys(providerId: string): Promise<ProviderKey[]> {
    return this.prisma.providerKey.findMany({
      where: {
        providerId,
        status: 'ACTIVE',
      },
      orderBy: { usageCount: 'asc' },
    });
  }

  async addKey(data: {
    providerId: string;
    keyAlias: string;
    apiKey: string;
    dailyLimit?: number;
    monthlyLimit?: number;
  }): Promise<ProviderKey> {
    const encryptedKey = encryptApiKey(data.apiKey);
    const keyPrefix = extractKeyPrefix(data.apiKey);

    return this.prisma.providerKey.create({
      data: {
        providerId: data.providerId,
        keyAlias: data.keyAlias,
        encryptedKey,
        keyPrefix,
        dailyLimit: data.dailyLimit,
        monthlyLimit: data.monthlyLimit,
      },
    });
  }

  async getDecryptedKey(keyId: string): Promise<string | null> {
    const key = await this.prisma.providerKey.findUnique({
      where: { id: keyId },
    });

    if (!key) return null;

    return decryptApiKey(key.encryptedKey);
  }

  async updateKeyStatus(id: string, status: KeyStatus, rateLimitResetAt?: Date): Promise<void> {
    await this.prisma.providerKey.update({
      where: { id },
      data: {
        status,
        rateLimitResetAt,
      },
    });
  }

  async incrementKeyUsage(id: string): Promise<void> {
    await this.prisma.providerKey.update({
      where: { id },
      data: {
        usageCount: { increment: 1 },
        dailyUsageCount: { increment: 1 },
        monthlyUsageCount: { increment: 1 },
        lastUsedAt: new Date(),
      },
    });
  }

  async resetDailyUsage(providerId: string): Promise<void> {
    await this.prisma.providerKey.updateMany({
      where: { providerId },
      data: {
        dailyUsageCount: 0,
        lastResetDaily: new Date(),
      },
    });
  }

  async resetMonthlyUsage(providerId: string): Promise<void> {
    await this.prisma.providerKey.updateMany({
      where: { providerId },
      data: {
        monthlyUsageCount: 0,
        lastResetMonthly: new Date(),
      },
    });
  }

  async deleteKey(id: string): Promise<void> {
    await this.prisma.providerKey.delete({
      where: { id },
    });
  }

  async getNextAvailableKey(providerId: string): Promise<ProviderKey | null> {
    // Get active keys that are not rate limited
    const key = await this.prisma.providerKey.findFirst({
      where: {
        providerId,
        status: 'ACTIVE',
        OR: [
          { rateLimitResetAt: null },
          { rateLimitResetAt: { lt: new Date() } },
        ],
      },
      orderBy: [
        { usageCount: 'asc' },
        { lastUsedAt: 'asc' },
      ],
    });

    // Reset rate limit if expired
    if (key?.rateLimitResetAt && key.rateLimitResetAt < new Date()) {
      await this.updateKeyStatus(key.id, 'ACTIVE');
    }

    return key;
  }
}
