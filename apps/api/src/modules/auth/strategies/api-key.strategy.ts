/**
 * ClawAI Gateway - API Key Strategy
 */

import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-custom';
import { PrismaClient } from '@clawai/database';
import { Request } from 'express';

@Injectable()
export class ApiKeyStrategy extends PassportStrategy(Strategy, 'api-key') {
  constructor(@Inject('PRISMA_CLIENT') private prisma: PrismaClient) {
    super();
  }

  async validate(req: Request): Promise<any> {
    const apiKey = req.headers['x-api-key'] as string;

    if (!apiKey) {
      throw new UnauthorizedException('API key is required');
    }

    const user = await this.prisma.user.findFirst({
      where: {
        apiKey,
        isActive: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid API key');
    }

    return {
      userId: user.id,
      email: user.email,
      role: user.role,
    };
  }
}
