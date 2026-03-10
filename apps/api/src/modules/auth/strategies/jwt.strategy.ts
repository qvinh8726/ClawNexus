/**
 * ClawAI Gateway - JWT Strategy
 */

import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthPayload } from '../auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET', 'clawai-secret-key'),
    });
  }

  async validate(payload: AuthPayload): Promise<AuthPayload> {
    return {
      userId: payload.userId,
      email: payload.email,
      role: payload.role,
    };
  }
}
