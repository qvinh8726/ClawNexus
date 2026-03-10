/**
 * ClawNexus - Usage Controller
 */

import {
  Controller,
  Get,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { UsageService } from './usage.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('api/usage')
@UseGuards(JwtAuthGuard)
export class UsageController {
  constructor(private readonly usageService: UsageService) {}

  @Get('stats')
  async getStats(
    @Request() req: any,
    @Query('period') period: 'day' | 'week' | 'month' = 'month',
  ) {
    return this.usageService.getStats(req.user.id, period);
  }

  @Get('logs')
  async getRequestLogs(
    @Request() req: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('providerId') providerId?: string,
    @Query('model') model?: string,
    @Query('status') status?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.usageService.getRequestLogs(req.user.id, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      providerId,
      model,
      status,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
  }

  @Get('models')
  async getModelUsage(
    @Request() req: any,
    @Query('period') period: 'day' | 'week' | 'month' = 'month',
  ) {
    return this.usageService.getModelUsage(req.user.id, period);
  }

  @Get('costs')
  async getCostBreakdown(
    @Request() req: any,
    @Query('period') period: 'day' | 'week' | 'month' = 'month',
  ) {
    return this.usageService.getCostBreakdown(req.user.id, period);
  }
}
