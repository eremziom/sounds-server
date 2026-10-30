import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import type { AuthResponse } from './auth.interfaces';

export const ROTATION_GRACE_MS = 5_000;

export type RotationResult = {
  previousTokenHash: string;
  validUntil: number;
  tokens: Omit<AuthResponse, 'user'>;
};

function encryptionKey(secret: string) {
  return createHash('sha256')
    .update('refresh-rotation\0')
    .update(secret)
    .digest();
}

// One encrypted result per session, shared by all API instances. Bind it to the
// session ID so ciphertext cannot be moved between sessions. No plaintext tokens
// are stored in the database, logs or a separate frontend session store.
export function sealRotationResult(
  result: RotationResult,
  secret: string,
  sessionId: string,
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(secret), iv);
  cipher.setAAD(Buffer.from(sessionId));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(result), 'utf8'),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}

export function readRotationResult(
  value: string,
  secret: string,
  sessionId: string,
): RotationResult | null {
  try {
    const data = Buffer.from(value, 'base64');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      encryptionKey(secret),
      data.subarray(0, 12),
    );
    decipher.setAAD(Buffer.from(sessionId));
    decipher.setAuthTag(data.subarray(12, 28));
    const json = Buffer.concat([
      decipher.update(data.subarray(28)),
      decipher.final(),
    ]).toString('utf8');
    const result = JSON.parse(json) as RotationResult;
    result.tokens.accessTokenExpiresAt = new Date(
      result.tokens.accessTokenExpiresAt,
    );
    result.tokens.refreshTokenExpiresAt = new Date(
      result.tokens.refreshTokenExpiresAt,
    );
    return result;
  } catch {
    return null;
  }
}
