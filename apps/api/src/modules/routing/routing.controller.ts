/**
 * ClawAI Gateway - Routing Controller
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { RoutingService } from './routing.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

class CreateRoutingRuleDto {
  name!: string;
  providerId!: string;
  modelPattern!: string;
  targetModel?: string;
  strategy?: string;
  priority?: number;
  conditions?: Record<string, unknown>;
  isActive?: boolean;
}

class UpdateRoutingRuleDto {
  name?: string;
  providerId?: string;
  modelPattern?: string;
  targetModel?: string;
  strategy?: string;
  priority?: number;
  conditions?: Record<string, unknown>;
  isActive?: boolean;
}

class CreateModelAliasDto {
  alias!: string;
  providerId!: string;
  targetModel!: string;
  description?: string;
}

class UpdateModelAliasDto {
  alias?: string;
  providerId?: string;
  targetModel?: string;
  description?: string;
  isActive?: boolean;
}

@Controller('api/routing')
@UseGuards(JwtAuthGuard)
export class RoutingController {
  constructor(private readonly routingService: RoutingService) {}

  // Routing Rules
  @Get('rules')
  async findAllRules(@Request() req: any) {
    return this.routingService.findAll(req.user.id);
  }

  @Get('rules/:id')
  async findRuleById(@Param('id') id: string, @Request() req: any) {
    return this.routingService.findById(id, req.user.id);
  }

  @Post('rules')
  async createRule(@Body() data: CreateRoutingRuleDto, @Request() req: any) {
    return this.routingService.create(req.user.id, data);
  }

  @Put('rules/:id')
  async updateRule(
    @Param('id') id: string,
    @Body() data: UpdateRoutingRuleDto,
    @Request() req: any,
  ) {
    return this.routingService.update(id, req.user.id, data);
  }

  @Delete('rules/:id')
  async deleteRule(@Param('id') id: string, @Request() req: any) {
    return this.routingService.delete(id, req.user.id);
  }

  @Post('rules/:id/toggle')
  async toggleRule(@Param('id') id: string, @Request() req: any) {
    return this.routingService.toggleActive(id, req.user.id);
  }

  @Post('rules/reorder')
  async reorderRules(@Body() body: { ruleIds: string[] }, @Request() req: any) {
    return this.routingService.reorderPriorities(req.user.id, body.ruleIds);
  }

  // Model Aliases
  @Get('aliases')
  async getAllAliases(@Request() req: any) {
    return this.routingService.getModelAliases(req.user.id);
  }

  @Post('aliases')
  async createAlias(@Body() data: CreateModelAliasDto, @Request() req: any) {
    return this.routingService.createModelAlias(req.user.id, data);
  }

  @Put('aliases/:id')
  async updateAlias(
    @Param('id') id: string,
    @Body() data: UpdateModelAliasDto,
    @Request() req: any,
  ) {
    return this.routingService.updateModelAlias(id, req.user.id, data);
  }

  @Delete('aliases/:id')
  async deleteAlias(@Param('id') id: string, @Request() req: any) {
    return this.routingService.deleteModelAlias(id, req.user.id);
  }
}
