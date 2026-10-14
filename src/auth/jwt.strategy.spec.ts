import { ConfigService } from '@nestjs/config';

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

describe('JwtStrategy', () => {
  it('maps JWT payload to authenticated request user', () => {
    const configService = {
      getOrThrow: jest.fn(() => 'test-secret'),
    } as unknown as ConfigService;
    const strategy = new JwtStrategy(configService);
    const payload: JwtPayload = {
      sub: 1,
      username: 'max',
      roles: ['USER'],
    };

    expect(strategy.validate(payload)).toEqual({
      userId: 1,
      username: 'max',
      roles: ['USER'],
    });
  });
});
