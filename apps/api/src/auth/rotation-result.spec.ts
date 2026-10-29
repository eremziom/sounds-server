import {
  readRotationResult,
  sealRotationResult,
  type RotationResult,
} from './rotation-result';

describe('encrypted rotation result', () => {
  const result: RotationResult = {
    previousTokenHash: 'hash',
    validUntil: 5_000,
    tokens: {
      accessToken: 'private-access-token',
      refreshToken: 'private-refresh-token',
      accessTokenExpiresAt: new Date(60_000),
      refreshTokenExpiresAt: new Date(600_000),
    },
  };

  it('restores exactly the same tokens and expiry dates without storing plaintext', () => {
    const sealed = sealRotationResult(result, 'secret', 'session-1');
    expect(readRotationResult(sealed, 'secret', 'session-1')).toEqual(result);
    expect(sealed).not.toContain(result.tokens.accessToken);
    expect(sealed).not.toContain(result.tokens.refreshToken);
    expect(sealRotationResult(result, 'secret', 'session-1')).not.toBe(sealed);
  });

  it('rejects a different key, session, truncated or tampered ciphertext', () => {
    const sealed = sealRotationResult(result, 'secret', 'session-1');
    expect(readRotationResult(sealed, 'wrong-key', 'session-1')).toBeNull();
    expect(readRotationResult(sealed, 'secret', 'session-2')).toBeNull();
    expect(readRotationResult('invalid', 'secret', 'session-1')).toBeNull();
    const tampered = Buffer.from(sealed, 'base64');
    tampered[tampered.length - 1] ^= 1;
    expect(
      readRotationResult(tampered.toString('base64'), 'secret', 'session-1'),
    ).toBeNull();
  });
});
