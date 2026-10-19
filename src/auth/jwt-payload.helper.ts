import type { JwtPayload } from './auth.interfaces';

export function isJwtPayload(value: unknown): value is JwtPayload {
  if (typeof value !== 'object' || value === null) return false;

  const payload = value as Record<string, unknown>;
  return (
    typeof payload.sub === 'number' &&
    Number.isInteger(payload.sub) &&
    payload.sub > 0 &&
    typeof payload.sid === 'string' &&
    payload.sid.length > 0 &&
    typeof payload.username === 'string' &&
    Array.isArray(payload.roles) &&
    payload.roles.every((role: unknown) => typeof role === 'string')
  );
}
