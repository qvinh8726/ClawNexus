/**
 * ClawNexus - Database Module
 */

import { Global, Module, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@clawnexus/database';

@Global()
@Module({
  providers: [
    {
      provide: 'PRISMA_CLIENT',
      useFactory: () => {
        const prisma = new PrismaClient({
          log: process.env.NODE_ENV === 'development'
            ? ['query', 'error', 'warn']
            : ['error'],
        });
        return prisma;
      },
    },
  ],
  exports: ['PRISMA_CLIENT'],
})
export class DatabaseModule implements OnModuleInit, OnModuleDestroy {
  constructor() {}

  async onModuleInit() {
    // Connection is lazy, will connect on first query
  }

  async onModuleDestroy() {
    // Cleanup handled by Prisma
  }
}
