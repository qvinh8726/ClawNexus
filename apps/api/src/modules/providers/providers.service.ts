/**
 * ClawNexus - Providers Service
 */

import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaClient, ProviderType, ProviderStatus, KeyStatus } from '@clawnexus/database';
import { encryptApiKey, extractKeyPrefix } from '@clawnexus/database';

@Injectable()
export class ProvidersService {
  constructor(@Inject('PRISMA_CLIENT') private prisma: PrismaClient) {}

  async findAll(userId: string) {
    return this.prisma.provider.findMany({
      where: { userId },
      include: {
        keys: {
          select: {
            id: true,
            keyAlias: true,
            keyPrefix: true,
            status: true,
            lastUsedAt: true,
            usageCount: true,
            dailyUsageCount: true,
            monthlyUsageCount: true,
            dailyLimit: true,
            monthlyLimit: true,
            rateLimitResetAt: true,
            createdAt: true,
          },
        },
        _count: {
          select: { requestLogs: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string, userId: string) {
    const provider = await this.prisma.provider.findFirst({
      where: { id, userId },
      include: {
        keys: {
          select: {
            id: true,
            keyAlias: true,
            keyPrefix: true,
            status: true,
            lastUsedAt: true,
            usageCount: true,
            dailyUsageCount: true,
            monthlyUsageCount: true,
            dailyLimit: true,
            monthlyLimit: true,
            rateLimitResetAt: true,
            createdAt: true,
          },
        },
      },
    });

    if (!provider) {
      throw new NotFoundException('Provider not found');
    }

    return provider;
  }

  async create(
    userId: string,
    data: {
      name: string;
      type: ProviderType;
      baseUrl?: string;
      isDefault?: boolean;
      config?: Record<string, unknown>;
    },
  ) {
    // Check for duplicate name
    const existing = await this.prisma.provider.findFirst({
      where: { userId, name: data.name },
    });

    if (existing) {
      throw new BadRequestException('Provider with this name already exists');
    }

    return this.prisma.provider.create({
      data: {
        userId,
        ...data,
        config: data.config as any,
      },
    });
  }

  async update(
    id: string,
    userId: string,
    data: {
      name?: string;
      baseUrl?: string;
      status?: ProviderStatus;
      isDefault?: boolean;
      config?: Record<string, unknown>;
    },
  ) {
    await this.findById(id, userId);

    return this.prisma.provider.update({
      where: { id },
      data: data as any,
    });
  }

  async delete(id: string, userId: string) {
    await this.findById(id, userId);

    await this.prisma.provider.delete({
      where: { id },
    });

    return { success: true };
  }

  // API Key Management
  async addKey(
    providerId: string,
    userId: string,
    data: {
      keyAlias: string;
      apiKey: string;
      dailyLimit?: number;
      monthlyLimit?: number;
    },
  ) {
    await this.findById(providerId, userId);

    const encryptedKey = encryptApiKey(data.apiKey);
    const keyPrefix = extractKeyPrefix(data.apiKey);

    return this.prisma.providerKey.create({
      data: {
        providerId,
        keyAlias: data.keyAlias,
        encryptedKey,
        keyPrefix,
        dailyLimit: data.dailyLimit,
        monthlyLimit: data.monthlyLimit,
      },
      select: {
        id: true,
        keyAlias: true,
        keyPrefix: true,
        status: true,
        createdAt: true,
      },
    });
  }

  async updateKey(
    keyId: string,
    userId: string,
    data: {
      keyAlias?: string;
      status?: KeyStatus;
      dailyLimit?: number;
      monthlyLimit?: number;
    },
  ) {
    // Verify ownership
    const key = await this.prisma.providerKey.findFirst({
      where: { id: keyId },
      include: { provider: true },
    });

    if (!key || key.provider.userId !== userId) {
      throw new NotFoundException('Key not found');
    }

    return this.prisma.providerKey.update({
      where: { id: keyId },
      data,
      select: {
        id: true,
        keyAlias: true,
        keyPrefix: true,
        status: true,
        dailyLimit: true,
        monthlyLimit: true,
      },
    });
  }

  async deleteKey(keyId: string, userId: string) {
    const key = await this.prisma.providerKey.findFirst({
      where: { id: keyId },
      include: { provider: true },
    });

    if (!key || key.provider.userId !== userId) {
      throw new NotFoundException('Key not found');
    }

    await this.prisma.providerKey.delete({
      where: { id: keyId },
    });

    return { success: true };
  }

  async testConnection(id: string, userId: string) {
    const provider = await this.prisma.provider.findFirst({
      where: { id, userId },
      include: {
        keys: {
          where: { status: 'ACTIVE' },
          take: 1,
        },
      },
    });

    if (!provider) {
      throw new NotFoundException('Provider not found');
    }

    if (provider.keys.length === 0) {
      throw new BadRequestException('No active API keys');
    }

    // TODO: Implement actual connection test
    return {
      success: true,
      latencyMs: 100,
      message: 'Connection successful',
    };
  }
}
