/**
 * ClawAI Gateway - User Repository
 */

import { PrismaClient, User, UserRole, RefreshToken } from '@prisma/client';
import { hashApiKey, generateApiKey } from '../encryption.js';

export class UserRepository {
  constructor(private prisma: PrismaClient) {}

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async findByApiKey(apiKey: string): Promise<User | null> {
    const hash = hashApiKey(apiKey);
    return this.prisma.user.findFirst({
      where: { apiKeyHash: hash, isActive: true },
    });
  }

  async create(data: {
    email: string;
    passwordHash: string;
    name?: string;
    role?: UserRole;
  }): Promise<User> {
    const apiKey = generateApiKey();
    const apiKeyHash = hashApiKey(apiKey);

    return this.prisma.user.create({
      data: {
        ...data,
        apiKey,
        apiKeyHash,
      },
    });
  }

  async update(id: string, data: Partial<Omit<User, 'id' | 'createdAt'>>): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data,
    });
  }

  async regenerateApiKey(id: string): Promise<string> {
    const apiKey = generateApiKey();
    const apiKeyHash = hashApiKey(apiKey);

    await this.prisma.user.update({
      where: { id },
      data: { apiKey, apiKeyHash },
    });

    return apiKey;
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { lastLoginAt: new Date() },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.user.delete({
      where: { id },
    });
  }

  // Refresh Token Methods
  async createRefreshToken(userId: string, token: string, expiresAt: Date): Promise<RefreshToken> {
    return this.prisma.refreshToken.create({
      data: {
        userId,
        token,
        expiresAt,
      },
    });
  }

  async findRefreshToken(token: string): Promise<RefreshToken | null> {
    return this.prisma.refreshToken.findUnique({
      where: { token },
    });
  }

  async deleteRefreshToken(token: string): Promise<void> {
    await this.prisma.refreshToken.delete({
      where: { token },
    });
  }

  async deleteUserRefreshTokens(userId: string): Promise<void> {
    await this.prisma.refreshToken.deleteMany({
      where: { userId },
    });
  }

  async cleanExpiredRefreshTokens(): Promise<number> {
    const result = await this.prisma.refreshToken.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });
    return result.count;
  }
}
