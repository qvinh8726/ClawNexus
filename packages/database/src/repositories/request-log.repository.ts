/**
 * ClawAI Gateway - Request Log Repository
 */

import { PrismaClient, RequestLog, RequestStatus, Prisma } from '@prisma/client';

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

export interface PaginationOptions {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export class RequestLogRepository {
  constructor(private prisma: PrismaClient) {}

  async create(data: {
    userId?: string;
    providerId: string;
    providerKeyId?: string;
    model: string;
    requestedModel: string;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
    cost: number;
    status: RequestStatus;
    errorMessage?: string;
    errorCode?: string;
    cached?: boolean;
    streamMode?: boolean;
    metadata?: Record<string, unknown>;
  }): Promise<RequestLog> {
    return this.prisma.requestLog.create({
      data: {
        ...data,
        totalTokens: data.inputTokens + data.outputTokens,
        cost: new Prisma.Decimal(data.cost),
        metadata: data.metadata as any,
      },
    });
  }

  async findById(id: string): Promise<RequestLog | null> {
    return this.prisma.requestLog.findUnique({
      where: { id },
      include: {
        provider: true,
        providerKey: true,
      },
    });
  }

  async findMany(
    filter: RequestLogFilter,
    pagination: PaginationOptions = {}
  ): Promise<{ logs: RequestLog[]; total: number }> {
    const { page = 1, pageSize = 50, sortBy = 'timestamp', sortOrder = 'desc' } = pagination;
    const skip = (page - 1) * pageSize;

    const where: Prisma.RequestLogWhereInput = {};

    if (filter.userId) where.userId = filter.userId;
    if (filter.providerId) where.providerId = filter.providerId;
    if (filter.model) where.model = { contains: filter.model, mode: 'insensitive' };
    if (filter.status) where.status = filter.status;
    if (filter.cached !== undefined) where.cached = filter.cached;

    if (filter.startDate || filter.endDate) {
      where.timestamp = {};
      if (filter.startDate) where.timestamp.gte = filter.startDate;
      if (filter.endDate) where.timestamp.lte = filter.endDate;
    }

    if (filter.minLatency || filter.maxLatency) {
      where.latencyMs = {};
      if (filter.minLatency) where.latencyMs.gte = filter.minLatency;
      if (filter.maxLatency) where.latencyMs.lte = filter.maxLatency;
    }

    const [logs, total] = await Promise.all([
      this.prisma.requestLog.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { [sortBy]: sortOrder },
        include: {
          provider: {
            select: { id: true, name: true, type: true },
          },
        },
      }),
      this.prisma.requestLog.count({ where }),
    ]);

    return { logs, total };
  }

  async getRecentLogs(userId: string, limit = 100): Promise<RequestLog[]> {
    return this.prisma.requestLog.findMany({
      where: { userId },
      take: limit,
      orderBy: { timestamp: 'desc' },
      include: {
        provider: {
          select: { id: true, name: true, type: true },
        },
      },
    });
  }

  async getStatsByTimeRange(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    totalTokens: bigint;
    totalCost: Prisma.Decimal;
    avgLatency: number;
  }> {
    const result = await this.prisma.requestLog.aggregate({
      where: {
        userId,
        timestamp: {
          gte: startDate,
          lte: endDate,
        },
      },
      _count: { id: true },
      _sum: {
        totalTokens: true,
        cost: true,
      },
      _avg: {
        latencyMs: true,
      },
    });

    const successCount = await this.prisma.requestLog.count({
      where: {
        userId,
        timestamp: { gte: startDate, lte: endDate },
        status: 'SUCCESS',
      },
    });

    return {
      totalRequests: result._count.id,
      successfulRequests: successCount,
      failedRequests: result._count.id - successCount,
      totalTokens: BigInt(result._sum.totalTokens || 0),
      totalCost: result._sum.cost || new Prisma.Decimal(0),
      avgLatency: Math.round(result._avg.latencyMs || 0),
    };
  }

  async getModelUsageStats(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<Array<{ model: string; count: number; totalTokens: bigint; cost: Prisma.Decimal }>> {
    const result = await this.prisma.requestLog.groupBy({
      by: ['model'],
      where: {
        userId,
        timestamp: { gte: startDate, lte: endDate },
      },
      _count: { id: true },
      _sum: {
        totalTokens: true,
        cost: true,
      },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    });

    return result.map((r) => ({
      model: r.model,
      count: r._count.id,
      totalTokens: BigInt(r._sum.totalTokens || 0),
      cost: r._sum.cost || new Prisma.Decimal(0),
    }));
  }

  async deleteOldLogs(olderThan: Date): Promise<number> {
    const result = await this.prisma.requestLog.deleteMany({
      where: {
        timestamp: { lt: olderThan },
      },
    });
    return result.count;
  }
}
