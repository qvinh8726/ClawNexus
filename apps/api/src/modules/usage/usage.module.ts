/**
 * ClawNexus - Usage Module
 */

import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { UsageService } from './usage.service';
import { UsageController } from './usage.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [UsageController],
  providers: [UsageService],
  exports: [UsageService],
})
export class UsageModule {}
