/**
 * ClawNexus - Routing Service
 */

import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@clawnexus/database';

@Injectable()
export class RoutingService {
  constructor(@Inject('PRISMA_CLIENT') private prisma: PrismaClient) {}

  async findAll(userId: string) {
    return this.prisma.routingRule.findMany({
      where: { userId },
      include: {
        providers: {
          include: {
            provider: {
              select: { id: true, name: true, type: true },
            },
          },
        },
      },
      orderBy: { priority: 'desc' },
    });
  }

  async findById(id: string, userId: string) {
    const rule = await this.prisma.routingRule.findFirst({
      where: { id, userId },
      include: {
        providers: {
          include: {
            provider: {
              select: { id: true, name: true, type: true },
            },
          },
        },
      },
    });

    if (!rule) {
      throw new NotFoundException('Routing rule not found');
    }

    return rule;
  }

  async create(
    userId: string,
    data: {
      name: string;
      providerId: string;
      modelPattern: string;
      targetModel?: string;
      strategy?: string;
      priority?: number;
      conditions?: Record<string, unknown>;
      isActive?: boolean;
    },
  ) {
    // Verify provider ownership
    const provider = await this.prisma.provider.findFirst({
      where: { id: data.providerId, userId },
    });

    if (!provider) {
      throw new BadRequestException('Provider not found');
    }

    return this.prisma.routingRule.create({
      data: {
        userId,
        name: data.name,
        modelPattern: data.modelPattern,
        strategy: data.strategy as any,
        priority: data.priority,
        conditions: data.conditions as any,
        isActive: data.isActive,
        providers: {
          create: {
            providerId: data.providerId,
            modelId: data.targetModel || data.modelPattern,
          },
        },
      },
      include: {
        providers: {
          include: {
            provider: {
              select: { id: true, name: true, type: true },
            },
          },
        },
      },
    });
  }

  async update(
    id: string,
    userId: string,
    data: {
      name?: string;
      providerId?: string;
      modelPattern?: string;
      targetModel?: string;
      strategy?: string;
      priority?: number;
      conditions?: Record<string, unknown>;
      isActive?: boolean;
    },
  ) {
    await this.findById(id, userId);

    if (data.providerId) {
      const provider = await this.prisma.provider.findFirst({
        where: { id: data.providerId, userId },
      });

      if (!provider) {
        throw new BadRequestException('Provider not found');
      }
    }

    return this.prisma.routingRule.update({
      where: { id },
      data: {
        name: data.name,
        modelPattern: data.modelPattern,
        strategy: data.strategy as any,
        priority: data.priority,
        conditions: data.conditions as any,
        isActive: data.isActive,
      },
      include: {
        providers: {
          include: {
            provider: {
              select: { id: true, name: true, type: true },
            },
          },
        },
      },
    });
  }

  async delete(id: string, userId: string) {
    await this.findById(id, userId);

    await this.prisma.routingRule.delete({
      where: { id },
    });

    return { success: true };
  }

  async toggleActive(id: string, userId: string) {
    const rule = await this.findById(id, userId);

    return this.prisma.routingRule.update({
      where: { id },
      data: { isActive: !rule.isActive },
    });
  }

  async reorderPriorities(userId: string, ruleIds: string[]) {
    const updates = ruleIds.map((id, index) =>
      this.prisma.routingRule.updateMany({
        where: { id, userId },
        data: { priority: ruleIds.length - index },
      }),
    );

    await this.prisma.$transaction(updates);

    return this.findAll(userId);
  }

  // Model Aliases
  async getModelAliases(userId: string) {
    return this.prisma.modelAlias.findMany({
      where: { userId },
      include: {
        provider: {
          select: { id: true, name: true, type: true },
        },
      },
    });
  }

  async createModelAlias(
    userId: string,
    data: {
      alias: string;
      providerId: string;
      targetModel: string;
      description?: string;
    },
  ) {
    // Check for duplicate alias
    const existing = await this.prisma.modelAlias.findFirst({
      where: { userId, alias: data.alias },
    });

    if (existing) {
      throw new BadRequestException('Alias already exists');
    }

    const provider = await this.prisma.provider.findFirst({
      where: { id: data.providerId, userId },
    });

    if (!provider) {
      throw new BadRequestException('Provider not found');
    }

    return this.prisma.modelAlias.create({
      data: { userId, ...data },
    });
  }

  async updateModelAlias(
    id: string,
    userId: string,
    data: {
      alias?: string;
      providerId?: string;
      targetModel?: string;
      description?: string;
      isActive?: boolean;
    },
  ) {
    const alias = await this.prisma.modelAlias.findFirst({
      where: { id, userId },
    });

    if (!alias) {
      throw new NotFoundException('Model alias not found');
    }

    if (data.providerId) {
      const provider = await this.prisma.provider.findFirst({
        where: { id: data.providerId, userId },
      });

      if (!provider) {
        throw new BadRequestException('Provider not found');
      }
    }

    return this.prisma.modelAlias.update({
      where: { id },
      data,
    });
  }

  async deleteModelAlias(id: string, userId: string) {
    const alias = await this.prisma.modelAlias.findFirst({
      where: { id, userId },
    });

    if (!alias) {
      throw new NotFoundException('Model alias not found');
    }

    await this.prisma.modelAlias.delete({
      where: { id },
    });

    return { success: true };
  }
}
