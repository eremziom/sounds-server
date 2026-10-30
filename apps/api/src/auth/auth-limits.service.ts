import {
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Prisma } from '../generated/prisma/client.cjs';
import { PrismaService } from '../prisma/prisma.service';
import { API_ERROR_CODES, codedError } from '../common/api-errors';
import type { AuthResponse } from './auth.interfaces';

export const LOGIN_WINDOW_MS = 15 * 60_000;
export const LOGIN_ATTEMPTS = 5;

@Injectable()
export class AuthLimitsService {
  private nextCleanup = 0;
  constructor(private readonly prisma: PrismaService) {}

  async cleanup() {
    if (Date.now() < this.nextCleanup) return;
    this.nextCleanup = Date.now() + 60_000;
    await this.prisma.authRateLimit.deleteMany({
      where: { resetAt: { lte: new Date() } },
    });
  }

  private key(scope: string, identity: string) {
    return createHash('sha256').update(`${scope}\0${identity}`).digest('hex');
  }

  // PostgreSQL's upsert locks this counter until commit. Parallel requests and
  // separate API instances cannot each claim the same remaining attempt.
  private async bucket(
    tx: Prisma.TransactionClient,
    key: string,
    windowMs: number,
  ) {
    const now = new Date();
    const resetAt = new Date(now.getTime() + windowMs);
    const [bucket] = await tx.$queryRaw<
      { key: string; count: number; resetAt: Date }[]
    >`
      INSERT INTO "AuthRateLimit" ("key", "count", "resetAt") VALUES (${key}, 0, ${resetAt})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "AuthRateLimit"."resetAt" <= ${now} THEN 0 ELSE "AuthRateLimit"."count" END,
        "resetAt" = CASE WHEN "AuthRateLimit"."resetAt" <= ${now} THEN ${resetAt} ELSE "AuthRateLimit"."resetAt" END
      RETURNING "key", "count", "resetAt"
    `;
    return bucket;
  }

  async consume(
    scope: string,
    identity: string,
    limit: number,
    windowMs: number,
  ) {
    const outcome = await this.prisma.$transaction(async (tx) => {
      const bucket = await this.bucket(tx, this.key(scope, identity), windowMs);
      if (bucket.count >= limit)
        return { allowed: false, resetAt: bucket.resetAt };
      await tx.authRateLimit.update({
        where: { key: bucket.key },
        data: { count: { increment: 1 } },
      });
      return { allowed: true, resetAt: bucket.resetAt };
    });
    if (!outcome.allowed)
      throw new HttpException(
        {
          code: API_ERROR_CODES.rateLimited,
          retryAfterSeconds: Math.max(
            1,
            Math.ceil((outcome.resetAt.getTime() - Date.now()) / 1000),
          ),
        },
        429,
      );
  }

  async login(
    identity: string,
    verify: (tx: Prisma.TransactionClient) => Promise<AuthResponse | null>,
  ) {
    const outcome = await this.prisma.$transaction(
      async (tx) => {
        const bucket = await this.bucket(
          tx,
          this.key('login-account', identity),
          LOGIN_WINDOW_MS,
        );
        if (bucket.count >= LOGIN_ATTEMPTS)
          return { count: LOGIN_ATTEMPTS, resetAt: bucket.resetAt };
        const result = await verify(tx);
        const count = result ? 0 : bucket.count + 1;
        const resetAt =
          result || count === LOGIN_ATTEMPTS
            ? new Date(Date.now() + LOGIN_WINDOW_MS)
            : bucket.resetAt;
        await tx.authRateLimit.update({
          where: { key: bucket.key },
          data: {
            count,
            resetAt,
          },
        });
        return { result, count, resetAt };
      },
      { maxWait: 10_000, timeout: 10_000 },
    );
    if (outcome.result) return outcome.result;
    if (outcome.count >= LOGIN_ATTEMPTS)
      throw new HttpException(
        {
          code: API_ERROR_CODES.loginLocked,
          retryAfterSeconds: Math.max(
            1,
            Math.ceil((outcome.resetAt.getTime() - Date.now()) / 1000),
          ),
        },
        429,
      );
    throw new UnauthorizedException(
      codedError(
        new UnauthorizedException('Invalid credentials'),
        outcome.count === LOGIN_ATTEMPTS - 1
          ? API_ERROR_CODES.lastLoginAttempt
          : API_ERROR_CODES.invalidCredentials,
      ),
    );
  }
}
