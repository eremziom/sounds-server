import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthenticatedUser } from './auth.interfaces';
import { isJwtPayload } from './jwt-payload.helper';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
      algorithms: ['HS256'],
    });
  }

  async validate(payload: unknown): Promise<AuthenticatedUser> {
    if (!isJwtPayload(payload)) {
      throw new UnauthorizedException('Invalid access token');
    }
    const session = await this.prisma.authSession.findFirst({
      where: {
        id: payload.sid,
        userId: payload.sub,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        user: { isActive: true },
      },
      select: { id: true },
    });
    if (!session)
      throw new UnauthorizedException('Session is no longer active');
    return {
      sessionId: payload.sid,
      userId: payload.sub,
      username: payload.username,
      roles: payload.roles,
    };
  }
}
