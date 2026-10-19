import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Prisma } from '../generated/prisma/client.cjs';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthResponse, JwtPayload } from './auth.interfaces';
import type { User } from '../users/users.interfaces';

@Injectable()
export class SessionsService {
  private readonly sessionLifetimeMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    const days = Number(config.get<string>('REFRESH_SESSION_DAYS', '30'));
    if (!Number.isFinite(days) || days <= 0 || days > 365) {
      throw new Error(
        'REFRESH_SESSION_DAYS must be greater than 0 and at most 365',
      );
    }
    this.sessionLifetimeMs = days * 86_400_000;
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async lockUser(tx: Prisma.TransactionClient, userId: number) {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
  }

  private async createTokenPair(
    tx: Prisma.TransactionClient,
    session: { id: string; expiresAt: Date },
    user: User,
  ): Promise<AuthResponse> {
    const refreshToken = randomBytes(32).toString('hex');
    await tx.refreshToken.create({
      data: {
        tokenHash: this.hash(refreshToken),
        sessionId: session.id,
        expiresAt: session.expiresAt,
      },
    });
    const { password, roles, ...profile } = user;
    void password;
    const userResponse = {
      ...profile,
      roles: roles?.map((assignment) => assignment.role) ?? [],
    };
    const payload: JwtPayload = {
      sub: user.id,
      sid: session.id,
      username: user.username,
      roles: userResponse.roles.map((role) => role.key),
    };
    const accessToken = await this.jwt.signAsync(payload, {
      jwtid: randomUUID(),
    });
    const decoded = this.jwt.decode<{ exp: number }>(accessToken);
    return {
      accessToken,
      refreshToken,
      accessTokenExpiresAt: new Date(decoded.exp * 1000),
      refreshTokenExpiresAt: session.expiresAt,
      user: userResponse,
    };
  }

  async create(
    userId: number,
    transaction?: Prisma.TransactionClient,
  ): Promise<AuthResponse> {
    const create = async (tx: Prisma.TransactionClient) => {
      await this.lockUser(tx, userId);
      const user = await tx.user.findUnique({
        where: { id: userId },
        include: { roles: { include: { role: true } } },
      });
      if (!user?.isActive) {
        throw new UnauthorizedException('Invalid credentials');
      }
      const session = await tx.authSession.create({
        data: {
          userId,
          expiresAt: new Date(Date.now() + this.sessionLifetimeMs),
        },
      });
      return this.createTokenPair(tx, session, user);
    };
    return transaction ? create(transaction) : this.prisma.$transaction(create);
  }

  async refresh(token: string): Promise<AuthResponse> {
    const tokenHash = this.hash(token);
    const response = await this.prisma.$transaction(async (tx) => {
      const reference = await tx.refreshToken.findUnique({
        where: { tokenHash },
        include: { session: true },
      });
      if (!reference) return null;

      await this.lockUser(tx, reference.session.userId);
      const current = await tx.refreshToken.findUnique({
        where: { tokenHash },
        include: {
          session: {
            include: {
              user: { include: { roles: { include: { role: true } } } },
            },
          },
        },
      });
      const now = new Date();
      if (!current || current.session.revokedAt) return null;
      const session = current.session;
      if (current.usedAt || !session.user.isActive) {
        await tx.authSession.update({
          where: { id: session.id },
          data: { revokedAt: now },
        });
        return null;
      }
      if (current.expiresAt <= now || session.expiresAt <= now) return null;

      const consumed = await tx.refreshToken.updateMany({
        where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) return null;
      return this.createTokenPair(tx, session, session.user);
    });
    if (!response) throw new UnauthorizedException('Invalid refresh token');
    return response;
  }

  async logout(token: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.refreshToken.findUnique({
        where: { tokenHash: this.hash(token) },
        include: { session: true },
      });
      if (!current) return;
      await this.lockUser(tx, current.session.userId);
      await tx.authSession.updateMany({
        where: { id: current.sessionId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
  }

  async logoutAll(userId: number): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, userId);
      await tx.authSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
  }
}
