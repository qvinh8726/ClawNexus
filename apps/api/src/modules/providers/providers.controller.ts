/**
 * ClawAI Gateway - Providers Controller
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
import { ProvidersService } from './providers.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProviderType, ProviderStatus, KeyStatus } from '@clawai/database';

class CreateProviderDto {
  name!: string;
  type!: ProviderType;
  baseUrl?: string;
  isDefault?: boolean;
  config?: Record<string, unknown>;
}

class UpdateProviderDto {
  name?: string;
  baseUrl?: string;
  status?: ProviderStatus;
  isDefault?: boolean;
  config?: Record<string, unknown>;
}

class AddKeyDto {
  keyAlias!: string;
  apiKey!: string;
  dailyLimit?: number;
  monthlyLimit?: number;
}

class UpdateKeyDto {
  keyAlias?: string;
  status?: KeyStatus;
  dailyLimit?: number;
  monthlyLimit?: number;
}

@Controller('api/providers')
@UseGuards(JwtAuthGuard)
export class ProvidersController {
  constructor(private readonly providersService: ProvidersService) {}

  @Get()
  async findAll(@Request() req: any) {
    return this.providersService.findAll(req.user.id);
  }

  @Get(':id')
  async findById(@Param('id') id: string, @Request() req: any) {
    return this.providersService.findById(id, req.user.id);
  }

  @Post()
  async create(@Body() data: CreateProviderDto, @Request() req: any) {
    return this.providersService.create(req.user.id, data);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() data: UpdateProviderDto,
    @Request() req: any,
  ) {
    return this.providersService.update(id, req.user.id, data);
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @Request() req: any) {
    return this.providersService.delete(id, req.user.id);
  }

  @Post(':id/test')
  async testConnection(@Param('id') id: string, @Request() req: any) {
    return this.providersService.testConnection(id, req.user.id);
  }

  // API Key endpoints
  @Post(':id/keys')
  async addKey(
    @Param('id') providerId: string,
    @Body() data: AddKeyDto,
    @Request() req: any,
  ) {
    return this.providersService.addKey(providerId, req.user.id, data);
  }

  @Put('keys/:keyId')
  async updateKey(
    @Param('keyId') keyId: string,
    @Body() data: UpdateKeyDto,
    @Request() req: any,
  ) {
    return this.providersService.updateKey(keyId, req.user.id, data);
  }

  @Delete('keys/:keyId')
  async deleteKey(@Param('keyId') keyId: string, @Request() req: any) {
    return this.providersService.deleteKey(keyId, req.user.id);
  }
}
