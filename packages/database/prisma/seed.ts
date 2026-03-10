/**
 * ClawAI Gateway - Database Seed
 * Seeds the database with initial data for development
 */

import { PrismaClient } from '@prisma/client';
import { scryptSync } from 'crypto';

const hashPassword = scryptSync;
const prisma = new PrismaClient();

const MODEL_CONFIGS = [
  // OpenAI Models
  {
    modelId: 'gpt-4o',
    displayName: 'GPT-4o',
    providerType: 'OPENAI',
    contextWindow: 128000,
    inputCostPer1kTokens: 0.005,
    outputCostPer1kTokens: 0.015,
    maxOutputTokens: 4096,
    supportsStreaming: true,
    supportsVision: true,
    supportsFunctionCalling: true,
    capabilities: ['chat', 'vision', 'function_calling', 'json_mode'],
  },
  {
    modelId: 'gpt-4o-mini',
    displayName: 'GPT-4o Mini',
    providerType: 'OPENAI',
    contextWindow: 128000,
    inputCostPer1kTokens: 0.00015,
    outputCostPer1kTokens: 0.0006,
    maxOutputTokens: 16384,
    supportsStreaming: true,
    supportsVision: true,
    supportsFunctionCalling: true,
    capabilities: ['chat', 'vision', 'function_calling', 'json_mode'],
  },
  {
    modelId: 'gpt-4-turbo',
    displayName: 'GPT-4 Turbo',
    providerType: 'OPENAI',
    contextWindow: 128000,
    inputCostPer1kTokens: 0.01,
    outputCostPer1kTokens: 0.03,
    maxOutputTokens: 4096,
    supportsStreaming: true,
    supportsVision: true,
    supportsFunctionCalling: true,
    capabilities: ['chat', 'vision', 'function_calling', 'json_mode'],
  },
  // Anthropic Models
  {
    modelId: 'claude-3-5-sonnet-20241022',
    displayName: 'Claude 3.5 Sonnet',
    providerType: 'ANTHROPIC',
    contextWindow: 200000,
    inputCostPer1kTokens: 0.003,
    outputCostPer1kTokens: 0.015,
    maxOutputTokens: 8192,
    supportsStreaming: true,
    supportsVision: true,
    supportsFunctionCalling: true,
    capabilities: ['chat', 'vision', 'function_calling', 'code', 'reasoning'],
  },
  {
    modelId: 'claude-3-opus-20240229',
    displayName: 'Claude 3 Opus',
    providerType: 'ANTHROPIC',
    contextWindow: 200000,
    inputCostPer1kTokens: 0.015,
    outputCostPer1kTokens: 0.075,
    maxOutputTokens: 4096,
    supportsStreaming: true,
    supportsVision: true,
    supportsFunctionCalling: true,
    capabilities: ['chat', 'vision', 'function_calling', 'code', 'reasoning'],
  },
  {
    modelId: 'claude-3-haiku-20240307',
    displayName: 'Claude 3 Haiku',
    providerType: 'ANTHROPIC',
    contextWindow: 200000,
    inputCostPer1kTokens: 0.00025,
    outputCostPer1kTokens: 0.00125,
    maxOutputTokens: 4096,
    supportsStreaming: true,
    supportsVision: true,
    supportsFunctionCalling: true,
    capabilities: ['chat', 'vision', 'function_calling'],
  },
  // Google Gemini Models
  {
    modelId: 'gemini-1.5-pro',
    displayName: 'Gemini 1.5 Pro',
    providerType: 'GEMINI',
    contextWindow: 2000000,
    inputCostPer1kTokens: 0.00125,
    outputCostPer1kTokens: 0.005,
    maxOutputTokens: 8192,
    supportsStreaming: true,
    supportsVision: true,
    supportsFunctionCalling: true,
    capabilities: ['chat', 'vision', 'function_calling', 'long_context'],
  },
  {
    modelId: 'gemini-1.5-flash',
    displayName: 'Gemini 1.5 Flash',
    providerType: 'GEMINI',
    contextWindow: 1000000,
    inputCostPer1kTokens: 0.000075,
    outputCostPer1kTokens: 0.0003,
    maxOutputTokens: 8192,
    supportsStreaming: true,
    supportsVision: true,
    supportsFunctionCalling: true,
    capabilities: ['chat', 'vision', 'function_calling'],
  },
  {
    modelId: 'gemini-2.0-flash-exp',
    displayName: 'Gemini 2.0 Flash',
    providerType: 'GEMINI',
    contextWindow: 1000000,
    inputCostPer1kTokens: 0.0001,
    outputCostPer1kTokens: 0.0004,
    maxOutputTokens: 8192,
    supportsStreaming: true,
    supportsVision: true,
    supportsFunctionCalling: true,
    capabilities: ['chat', 'vision', 'function_calling', 'reasoning'],
  },
];

async function main() {
  console.log('🌱 Starting database seed...\n');

  // Create model configs
  console.log('📦 Creating model configurations...');
  for (const model of MODEL_CONFIGS) {
    await prisma.modelConfig.upsert({
      where: { modelId: model.modelId },
      update: model as any,
      create: model as any,
    });
    console.log(`  ✓ ${model.displayName}`);
  }

  // Create default admin user
  console.log('\n👤 Creating default admin user...');
  const passwordHash = hashPassword('admin123', 'clawai-salt', 32).toString('hex');

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@clawai.local' },
    update: {},
    create: {
      email: 'admin@clawai.local',
      passwordHash,
      name: 'Admin',
      role: 'ADMIN',
      apiKey: 'claw_admin_dev_key_12345',
      apiKeyHash: hashPassword('claw_admin_dev_key_12345', 'clawai-salt', 32).toString('hex'),
    },
  });
  console.log(`  ✓ Admin user created: ${adminUser.email}`);

  // Create system config
  console.log('\n⚙️ Creating system configuration...');
  await prisma.systemConfig.upsert({
    where: { key: 'gateway_config' },
    update: {},
    create: {
      key: 'gateway_config',
      value: {
        rateLimiting: {
          enabled: true,
          windowMs: 60000,
          maxRequests: 100,
        },
        caching: {
          enabled: true,
          ttlSeconds: 300,
          maxSize: 1000,
        },
        logging: {
          level: 'info',
          format: 'json',
          includeBody: false,
        },
        security: {
          requireAuth: true,
          allowedOrigins: ['http://localhost:3000'],
        },
      },
    },
  });
  console.log('  ✓ Gateway configuration created');

  console.log('\n✅ Database seed completed!\n');
  console.log('Default credentials:');
  console.log('  Email: admin@clawai.local');
  console.log('  Password: admin123');
  console.log('  API Key: claw_admin_dev_key_12345\n');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
