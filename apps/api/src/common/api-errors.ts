import { HttpException } from '@nestjs/common';

export const API_ERROR_CODES = {
  invalidCredentials: 'AUTH_INVALID_CREDENTIALS',
  lastLoginAttempt: 'AUTH_LAST_LOGIN_ATTEMPT',
  loginLocked: 'AUTH_LOGIN_LOCKED',
  rateLimited: 'AUTH_RATE_LIMITED',
  emailAlreadyInUse: 'EMAIL_ALREADY_IN_USE',
  authenticationRequired: 'AUTH_REQUIRED',
  invalidSession: 'AUTH_SESSION_INVALID',
  accessDenied: 'ACCESS_DENIED',
  validationFailed: 'VALIDATION_FAILED',
  invalidRequest: 'INVALID_REQUEST',
  notFound: 'NOT_FOUND',
  conflict: 'CONFLICT',
  internalError: 'INTERNAL_ERROR',
  httpError: 'HTTP_ERROR',
} as const;

export type ApiErrorCode =
  (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];

// Keep Nest's existing statusCode/message/error body, adding only a stable code.
export function codedError(exception: HttpException, code: ApiErrorCode) {
  const response = exception.getResponse();
  return {
    ...(typeof response === 'string'
      ? { statusCode: exception.getStatus(), message: response }
      : response),
    code,
  };
}
