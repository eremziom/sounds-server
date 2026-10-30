import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';

jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('@nestjs/passport', () => ({
  PassportStrategy: (Strategy: new (...args: unknown[]) => unknown) => Strategy,
}));

jest.mock('passport-jwt', () => ({
  ExtractJwt: {
    fromAuthHeaderAsBearerToken: jest.fn(() => 'bearer-token-extractor'),
  },
  Strategy: class Strategy {
    constructor(public readonly options: unknown) {}
  },
}));

import { JwtPayload } from './auth.interfaces';
import { JwtStrategy } from './jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';

describe('JwtStrategy', () => {
  const findFirst = jest.fn();
  let strategy: JwtStrategy;
  const sessionExpiresAt = new Date(Date.now() + 60_000);
  const payload: JwtPayload = {
    sub: 1,
    sid: 'session-id',
    username: 'max',
    roles: ['USER'],
  };

  beforeEach(() => {
    const configService = {
      getOrThrow: jest.fn(() => 'test-secret'),
    } as unknown as ConfigService;
    findFirst
      .mockReset()
      .mockResolvedValue({ id: payload.sid, expiresAt: sessionExpiresAt });
    strategy = new JwtStrategy(configService, {
      authSession: { findFirst },
    } as unknown as PrismaService);
  });

  it('maps a JWT to the authenticated user after checking its session', async () => {
    await expect(strategy.validate(payload)).resolves.toEqual({
      sessionId: payload.sid,
      sessionExpiresAt,
      userId: 1,
      username: 'max',
      roles: ['USER'],
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: payload.sid,
        userId: 1,
        revokedAt: null,
        expiresAt: { gt: expect.any(Date) as Date },
        user: { isActive: true },
      },
      select: { id: true, expiresAt: true },
    });
  });

  it('rejects an inactive, expired, revoked or missing session', async () => {
    findFirst.mockResolvedValue(null);
    await expect(strategy.validate(payload)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it.each([
    null,
    undefined,
    'invalid',
    {},
    { ...payload, sid: undefined },
    { ...payload, sid: '' },
    { ...payload, sub: '1' },
    { ...payload, sub: 0 },
    { ...payload, sub: 1.5 },
    { ...payload, username: undefined },
    { ...payload, roles: [1] },
    { ...payload, roles: undefined },
  ])('rejects malformed and legacy JWT claims: %j', async (invalid) => {
    await expect(strategy.validate(invalid)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(findFirst).not.toHaveBeenCalled();
  });
});
