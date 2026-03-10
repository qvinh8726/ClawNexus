/**
 * ClawNexus - Health Controller
 */

import { Controller, Get, Inject } from '@nestjs/common';
import { PrismaClient } from '@clawnexus/database';

@Controller('health')
export class HealthController {
  constructor(@Inject('PRISMA_CLIENT') private prisma: PrismaClient) {}

  @Get()
  async check() {
    const checks = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: {} as Record<string, { status: string; latency?: number }>,
    };

    // Database check
    const dbStart = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.services.database = {
        status: 'healthy',
        latency: Date.now() - dbStart,
      };
    } catch (error) {
      checks.status = 'degraded';
      checks.services.database = { status: 'unhealthy' };
    }

    return checks;
  }

  @Get('ready')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ready' };
    } catch {
      return { status: 'not ready' };
    }
  }

  @Get('live')
  live() {
    return { status: 'alive' };
  }
}
