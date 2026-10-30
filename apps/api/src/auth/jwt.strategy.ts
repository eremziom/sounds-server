import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthenticatedUser } from './auth.interfaces';
import { isJwtPayload } from './jwt-payload.helper';
import { PrismaService } from '../prisma/prisma.service';
import { API_ERROR_CODES, codedError } from '../common/api-errors';

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
      throw new UnauthorizedException(
        codedError(
          new UnauthorizedException('Invalid access token'),
          API_ERROR_CODES.invalidSession,
        ),
      );
    }
    const session = await this.prisma.authSession.findFirst({
      where: {
        id: payload.sid,
        userId: payload.sub,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        user: { isActive: true },
      },
      select: { id: true, expiresAt: true },
    });
    if (!session)
      throw new UnauthorizedException(
        codedError(
          new UnauthorizedException('Session is no longer active'),
          API_ERROR_CODES.invalidSession,
        ),
      );
    return {
      sessionId: payload.sid,
      sessionExpiresAt: session.expiresAt,
      userId: payload.sub,
      username: payload.username,
      roles: payload.roles,
    };
  }
}
