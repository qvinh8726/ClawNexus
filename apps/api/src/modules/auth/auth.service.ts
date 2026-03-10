/**
 * ClawAI Gateway - Auth Service
 */

import { Injectable, Inject, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, User } from '@clawai/database';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

export interface AuthPayload {
  userId: string;
  email: string;
  role: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject('PRISMA_CLIENT') private prisma: PrismaClient,
    private jwtService: JwtService,
  ) {}

  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.isActive) {
      return null;
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      return null;
    }

    return user;
  }

  async validateApiKey(apiKey: string): Promise<User | null> {
    // Hash the API key for comparison
    const hash = await bcrypt.hash(apiKey, 10);

    const user = await this.prisma.user.findFirst({
      where: {
        apiKey,
        isActive: true,
      },
    });

    return user;
  }

  async login(email: string, password: string): Promise<TokenPair & { user: Partial<User> }> {
    const user = await this.validateUser(email, password);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.generateTokens(user);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  async register(email: string, password: string, name?: string): Promise<TokenPair & { user: Partial<User> }> {
    // Check if user exists
    const existing = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      throw new ConflictException('Email already registered');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Generate API key
    const apiKey = `claw_${randomBytes(24).toString('base64url')}`;

    // Create user
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        apiKey,
        role: 'USER',
      },
    });

    const tokens = await this.generateTokens(user);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        apiKey: user.apiKey,
      },
    };
  }

  async refreshToken(refreshToken: string): Promise<TokenPair> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Delete old refresh token
    await this.prisma.refreshToken.delete({
      where: { id: stored.id },
    });

    return this.generateTokens(stored.user);
  }

  async logout(userId: string, refreshToken?: string): Promise<void> {
    if (refreshToken) {
      await this.prisma.refreshToken.deleteMany({
        where: { token: refreshToken },
      });
    } else {
      await this.prisma.refreshToken.deleteMany({
        where: { userId },
      });
    }
  }

  async regenerateApiKey(userId: string): Promise<string> {
    const apiKey = `claw_${randomBytes(24).toString('base64url')}`;

    await this.prisma.user.update({
      where: { id: userId },
      data: { apiKey },
    });

    return apiKey;
  }

  private async generateTokens(user: User): Promise<TokenPair> {
    const payload: AuthPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload);

    const refreshToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: refreshToken,
        expiresAt,
      },
    });

    return { accessToken, refreshToken };
  }
}
