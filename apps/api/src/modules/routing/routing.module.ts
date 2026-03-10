/**
 * ClawNexus - Routing Module
 */

import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { RoutingService } from './routing.service';
import { RoutingController } from './routing.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [RoutingController],
  providers: [RoutingService],
  exports: [RoutingService],
})
export class RoutingModule {}
