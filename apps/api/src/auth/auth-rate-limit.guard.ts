import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import type { Request } from 'express';
import { AuthLimitsService } from './auth-limits.service';

function normalizeIP(address: string) {
  return address.replace(/^::ffff:/, '');
}

// This header is signed by the UI's HTTP server using its socket peer, never
// copied from browser-provided X-Forwarded-For. Direct API clients use their socket.
export function requestSource(request: Request, secret: string): string {
  const value = request.headers['x-sounds-client-source'];
  if (
    secret.length >= 32 &&
    !secret.startsWith('<') &&
    typeof value === 'string' &&
    value.length < 512
  ) {
    const [timestamp, address, signature] = value.split('.');
    const payload = `${timestamp}.${address}`;
    const expected = createHmac('sha256', secret).update(payload).digest('hex');
    if (
      signature?.length === expected.length &&
      /^[a-f0-9]+$/.test(signature) &&
      timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) &&
      Math.abs(Date.now() - Number(timestamp)) < 60_000
    ) {
      const ip = Buffer.from(address, 'base64url').toString();
      if (isIP(ip)) return normalizeIP(ip);
    }
  }
  return normalizeIP(request.socket.remoteAddress ?? 'unknown');
}

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  constructor(
    private readonly limits: AuthLimitsService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const source = requestSource(
      request,
      this.config.get<string>('AUTH_PROXY_SECRET') ?? '',
    );
    const operation = context.getHandler().name;
    await this.limits.cleanup();
    const [limit, windowMs] =
      operation === 'register'
        ? [20, 3_600_000]
        : operation === 'refresh'
          ? [120, 60_000]
          : [100, 60_000];
    await this.limits.consume(`source-${operation}`, source, limit, windowMs);
    return true;
  }
}
