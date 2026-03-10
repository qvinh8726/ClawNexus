/**
 * ClawNexus - Routing Repository
 */

import {
  PrismaClient,
  RoutingRule,
  RoutingRuleProvider,
  RoutingStrategy
} from '@prisma/client';

export type RoutingRuleWithProviders = RoutingRule & {
  providers: RoutingRuleProvider[];
};

export class RoutingRepository {
  constructor(private prisma: PrismaClient) {}

  async findById(id: string): Promise<RoutingRuleWithProviders | null> {
    return this.prisma.routingRule.findUnique({
      where: { id },
      include: {
        providers: {
          include: {
            provider: true,
          },
        },
      },
    });
  }

  async findByUserId(userId: string): Promise<RoutingRuleWithProviders[]> {
    return this.prisma.routingRule.findMany({
      where: { userId },
      include: {
        providers: {
          orderBy: { priority: 'asc' },
        },
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'asc' },
      ],
    });
  }

  async findActiveByPattern(userId: string, modelPattern: string): Promise<RoutingRuleWithProviders | null> {
    // First try exact match
    let rule = await this.prisma.routingRule.findFirst({
      where: {
        userId,
        modelPattern,
        isActive: true,
      },
      include: {
        providers: {
          orderBy: { priority: 'asc' },
        },
      },
    });

    if (rule) return rule;

    // Try wildcard match
    rule = await this.prisma.routingRule.findFirst({
      where: {
        userId,
        modelPattern: '*',
        isActive: true,
      },
      include: {
        providers: {
          orderBy: { priority: 'asc' },
        },
      },
    });

    return rule;
  }

  async create(data: {
    userId: string;
    name: string;
    description?: string;
    modelPattern: string;
    strategy?: RoutingStrategy;
    fallbackEnabled?: boolean;
    retryCount?: number;
    priority?: number;
    conditions?: unknown[];
    providers: Array<{
      providerId: string;
      modelId: string;
      weight?: number;
      priority?: number;
    }>;
  }): Promise<RoutingRuleWithProviders> {
    return this.prisma.routingRule.create({
      data: {
        userId: data.userId,
        name: data.name,
        description: data.description,
        modelPattern: data.modelPattern,
        strategy: data.strategy || 'PRIORITY',
        fallbackEnabled: data.fallbackEnabled ?? true,
        retryCount: data.retryCount ?? 2,
        priority: data.priority ?? 0,
        conditions: data.conditions as any,
        providers: {
          create: data.providers.map((p, index) => ({
            providerId: p.providerId,
            modelId: p.modelId,
            weight: p.weight ?? 1,
            priority: p.priority ?? index,
          })),
        },
      },
      include: {
        providers: {
          orderBy: { priority: 'asc' },
        },
      },
    });
  }

  async update(
    id: string,
    data: {
      name?: string;
      description?: string;
      modelPattern?: string;
      strategy?: RoutingStrategy;
      fallbackEnabled?: boolean;
      retryCount?: number;
      isActive?: boolean;
      priority?: number;
      conditions?: unknown[];
    }
  ): Promise<RoutingRule> {
    return this.prisma.routingRule.update({
      where: { id },
      data: data as any,
    });
  }

  async updateProviders(
    ruleId: string,
    providers: Array<{
      providerId: string;
      modelId: string;
      weight?: number;
      priority?: number;
    }>
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.routingRuleProvider.deleteMany({
        where: { ruleId },
      }),
      this.prisma.routingRuleProvider.createMany({
        data: providers.map((p, index) => ({
          ruleId,
          providerId: p.providerId,
          modelId: p.modelId,
          weight: p.weight ?? 1,
          priority: p.priority ?? index,
        })),
      }),
    ]);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.routingRule.delete({
      where: { id },
    });
  }

  async toggleActive(id: string, isActive: boolean): Promise<void> {
    await this.prisma.routingRule.update({
      where: { id },
      data: { isActive },
    });
  }
}
