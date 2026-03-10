/**
 * ClawNexus - Usage Repository
 */

import { PrismaClient, UsageMetric, MetricPeriod, Prisma } from '@prisma/client';

export class UsageRepository {
  constructor(private prisma: PrismaClient) {}

  async upsertMetric(data: {
    userId?: string;
    providerId?: string;
    period: MetricPeriod;
    periodStart: Date;
    periodEnd: Date;
    inputTokens: number;
    outputTokens: number;
    cost: number;
    latencyMs: number;
    success: boolean;
    cached: boolean;
  }): Promise<void> {
    const existing = await this.prisma.usageMetric.findFirst({
      where: {
        userId: data.userId ?? null,
        providerId: data.providerId ?? null,
        period: data.period,
        periodStart: data.periodStart,
      },
    });

    if (existing) {
      await this.prisma.usageMetric.update({
        where: { id: existing.id },
        data: {
          totalRequests: { increment: 1 },
          successfulRequests: data.success ? { increment: 1 } : undefined,
          failedRequests: !data.success ? { increment: 1 } : undefined,
          inputTokens: { increment: data.inputTokens },
          outputTokens: { increment: data.outputTokens },
          totalTokens: { increment: data.inputTokens + data.outputTokens },
          totalCost: { increment: data.cost },
          cacheHits: data.cached ? { increment: 1 } : undefined,
          cacheMisses: !data.cached ? { increment: 1 } : undefined,
        },
      });
    } else {
      await this.prisma.usageMetric.create({
        data: {
          userId: data.userId,
          providerId: data.providerId,
          period: data.period,
          periodStart: data.periodStart,
          periodEnd: data.periodEnd,
          totalRequests: 1,
          successfulRequests: data.success ? 1 : 0,
          failedRequests: data.success ? 0 : 1,
          inputTokens: data.inputTokens,
          outputTokens: data.outputTokens,
          totalTokens: data.inputTokens + data.outputTokens,
          totalCost: data.cost,
          avgLatencyMs: data.latencyMs,
          p50LatencyMs: data.latencyMs,
          p95LatencyMs: data.latencyMs,
          p99LatencyMs: data.latencyMs,
          cacheHits: data.cached ? 1 : 0,
          cacheMisses: data.cached ? 0 : 1,
        },
      });
    }
  }

  async getMetrics(
    userId: string,
    period: MetricPeriod,
    startDate: Date,
    endDate: Date
  ): Promise<UsageMetric[]> {
    return this.prisma.usageMetric.findMany({
      where: {
        userId,
        period,
        periodStart: { gte: startDate },
        periodEnd: { lte: endDate },
      },
      orderBy: { periodStart: 'asc' },
    });
  }

  async getProviderMetrics(
    userId: string,
    providerId: string,
    period: MetricPeriod,
    startDate: Date,
    endDate: Date
  ): Promise<UsageMetric[]> {
    return this.prisma.usageMetric.findMany({
      where: {
        userId,
        providerId,
        period,
        periodStart: { gte: startDate },
        periodEnd: { lte: endDate },
      },
      orderBy: { periodStart: 'asc' },
    });
  }

  async getTotalUsage(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{
    totalRequests: number;
    totalTokens: bigint;
    totalCost: Prisma.Decimal;
    avgLatency: number;
    successRate: number;
    cacheHitRate: number;
  }> {
    const result = await this.prisma.usageMetric.aggregate({
      where: {
        userId,
        period: 'DAILY',
        periodStart: { gte: startDate },
        periodEnd: { lte: endDate },
      },
      _sum: {
        totalRequests: true,
        successfulRequests: true,
        failedRequests: true,
        totalTokens: true,
        totalCost: true,
        cacheHits: true,
        cacheMisses: true,
      },
      _avg: {
        avgLatencyMs: true,
      },
    });

    const totalRequests = result._sum.totalRequests || 0;
    const successfulRequests = result._sum.successfulRequests || 0;
    const cacheHits = result._sum.cacheHits || 0;
    const cacheMisses = result._sum.cacheMisses || 0;

    return {
      totalRequests,
      totalTokens: result._sum.totalTokens || BigInt(0),
      totalCost: result._sum.totalCost || new Prisma.Decimal(0),
      avgLatency: Math.round(result._avg.avgLatencyMs || 0),
      successRate: totalRequests > 0 ? (successfulRequests / totalRequests) * 100 : 0,
      cacheHitRate: (cacheHits + cacheMisses) > 0
        ? (cacheHits / (cacheHits + cacheMisses)) * 100
        : 0,
    };
  }

  async getCostByProvider(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<Array<{ providerId: string; totalCost: Prisma.Decimal; requestCount: number }>> {
    const result = await this.prisma.usageMetric.groupBy({
      by: ['providerId'],
      where: {
        userId,
        providerId: { not: null },
        period: 'DAILY',
        periodStart: { gte: startDate },
        periodEnd: { lte: endDate },
      },
      _sum: {
        totalCost: true,
        totalRequests: true,
      },
    });

    return result
      .filter((r) => r.providerId)
      .map((r) => ({
        providerId: r.providerId!,
        totalCost: r._sum.totalCost || new Prisma.Decimal(0),
        requestCount: r._sum.totalRequests || 0,
      }));
  }

  async deleteOldMetrics(period: MetricPeriod, olderThan: Date): Promise<number> {
    const result = await this.prisma.usageMetric.deleteMany({
      where: {
        period,
        periodEnd: { lt: olderThan },
      },
    });
    return result.count;
  }
}
