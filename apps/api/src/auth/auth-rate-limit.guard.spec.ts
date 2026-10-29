import { createHmac } from 'node:crypto';
import type { Request } from 'express';
jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));
import { requestSource } from './auth-rate-limit.guard';

describe('trusted request source', () => {
  const secret = 'a separate shared proxy signing secret';
  const signed = (ip: string, timestamp = Date.now()) => {
    const payload = `${timestamp}.${Buffer.from(ip).toString('base64url')}`;
    return `${payload}.${createHmac('sha256', secret).update(payload).digest('hex')}`;
  };
  const request = (headers: Record<string, string>) =>
    ({ socket: { remoteAddress: '::ffff:127.0.0.1' }, headers }) as Request;

  it('accepts a fresh signed address from the UI server', () => {
    expect(
      requestSource(
        request({ 'x-sounds-client-source': signed('192.0.2.1') }),
        secret,
      ),
    ).toBe('192.0.2.1');
  });

  it('ignores spoofed, stale or malformed headers and uses the actual peer', () => {
    for (const value of [
      signed('192.0.2.1') + 'a',
      signed('192.0.2.1', Date.now() - 120_000),
      signed('not-an-ip'),
      'forged',
    ]) {
      expect(
        requestSource(
          request({
            'x-sounds-client-source': value,
            'x-forwarded-for': '198.51.100.1',
          }),
          secret,
        ),
      ).toBe('127.0.0.1');
    }
    expect(
      requestSource(
        request({ 'x-sounds-client-source': signed('192.0.2.1') }),
        'wrong',
      ),
    ).toBe('127.0.0.1');
  });
});
