/**
 * ClawAI Gateway - Usage Service
 */

import { Injectable, Inject } from '@nestjs/common';
import { PrismaClient } from '@clawai/database';

@Injectable()
export class UsageService {
  constructor(@Inject('PRISMA_CLIENT') private prisma: PrismaClient) {}

  async getStats(userId: string, period: 'day' | 'week' | 'month' = 'month') {
    const now = new Date();
    const startDate = new Date();

    switch (period) {
      case 'day':
        startDate.setDate(now.getDate() - 1);
        break;
      case 'week':
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(now.getMonth() - 1);
        break;
    }

    const [requests, metrics, providers] = await Promise.all([
      // Request stats
      this.prisma.requestLog.aggregate({
        where: {
          userId,
          timestamp: { gte: startDate },
        },
        _count: true,
        _sum: {
          inputTokens: true,
          outputTokens: true,
          cost: true,
        },
        _avg: {
          latencyMs: true,
        },
      }),

      // Metrics by day
      this.prisma.usageMetric.findMany({
        where: {
          userId,
          periodStart: { gte: startDate },
        },
        orderBy: { periodStart: 'asc' },
      }),

      // Provider stats
      this.prisma.requestLog.groupBy({
        by: ['providerId'],
        where: {
          userId,
          timestamp: { gte: startDate },
        },
        _count: true,
        _sum: {
          cost: true,
          inputTokens: true,
          outputTokens: true,
        },
      }),
    ]);

    const successRate = await this.getSuccessRate(userId, startDate);

    return {
      summary: {
        totalRequests: requests._count,
        totalTokens:
          (requests._sum.inputTokens || 0) + (requests._sum.outputTokens || 0),
        totalCost: requests._sum.cost || 0,
        averageLatency: Math.round(requests._avg.latencyMs || 0),
        successRate,
      },
      metrics,
      byProvider: providers,
    };
  }

  async getRequestLogs(
    userId: string,
    options: {
      page?: number;
      limit?: number;
      providerId?: string;
      model?: string;
      status?: string;
      startDate?: Date;
      endDate?: Date;
    } = {},
  ) {
    const { page = 1, limit = 50, providerId, model, status, startDate, endDate } = options;
    const skip = (page - 1) * limit;

    const where: any = { userId };

    if (providerId) where.providerId = providerId;
    if (model) where.model = model;
    if (status) where.status = status;
    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) where.timestamp.gte = startDate;
      if (endDate) where.timestamp.lte = endDate;
    }

    const [logs, total] = await Promise.all([
      this.prisma.requestLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { timestamp: 'desc' },
        include: {
          provider: {
            select: { name: true, type: true },
          },
        },
      }),
      this.prisma.requestLog.count({ where }),
    ]);

    return {
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getModelUsage(userId: string, period: 'day' | 'week' | 'month' = 'month') {
    const startDate = new Date();
    switch (period) {
      case 'day':
        startDate.setDate(startDate.getDate() - 1);
        break;
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
    }

    return this.prisma.requestLog.groupBy({
      by: ['model'],
      where: {
        userId,
        timestamp: { gte: startDate },
      },
      _count: true,
      _sum: {
        cost: true,
        inputTokens: true,
        outputTokens: true,
      },
      _avg: {
        latencyMs: true,
      },
    });
  }

  async getCostBreakdown(userId: string, period: 'day' | 'week' | 'month' = 'month') {
    const startDate = new Date();
    switch (period) {
      case 'day':
        startDate.setDate(startDate.getDate() - 1);
        break;
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
    }

    const [byProvider, byModel, dailyCosts] = await Promise.all([
      this.prisma.requestLog.groupBy({
        by: ['providerId'],
        where: { userId, timestamp: { gte: startDate } },
        _sum: { cost: true },
      }),

      this.prisma.requestLog.groupBy({
        by: ['model'],
        where: { userId, timestamp: { gte: startDate } },
        _sum: { cost: true },
      }),

      this.prisma.usageMetric.findMany({
        where: { userId, periodStart: { gte: startDate } },
        select: { periodStart: true, totalCost: true },
        orderBy: { periodStart: 'asc' },
      }),
    ]);

    return { byProvider, byModel, dailyCosts };
  }

  private async getSuccessRate(userId: string, startDate: Date): Promise<number> {
    const total = await this.prisma.requestLog.count({
      where: { userId, timestamp: { gte: startDate } },
    });

    if (total === 0) return 100;

    const successful = await this.prisma.requestLog.count({
      where: {
        userId,
        timestamp: { gte: startDate },
        status: 'SUCCESS',
      },
    });

    return Math.round((successful / total) * 10000) / 100;
  }
}
