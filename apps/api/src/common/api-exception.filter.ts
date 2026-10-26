import { ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import type { ExceptionFilter } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { API_ERROR_CODES, codedError } from './api-errors';
import type { ApiErrorCode } from './api-errors';

const statusCodes: Record<number, ApiErrorCode> = {
  400: API_ERROR_CODES.invalidRequest,
  401: API_ERROR_CODES.authenticationRequired,
  403: API_ERROR_CODES.accessDenied,
  404: API_ERROR_CODES.notFound,
  409: API_ERROR_CODES.conflict,
};

@Catch(HttpException)
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(private readonly adapterHost: HttpAdapterHost) {}

  catch(exception: HttpException, host: ArgumentsHost) {
    const status = exception.getStatus();
    const original = exception.getResponse();
    const code =
      typeof original === 'object' && 'code' in original
        ? original.code
        : (statusCodes[status] ??
          (status >= 500
            ? API_ERROR_CODES.internalError
            : API_ERROR_CODES.httpError));
    const body = {
      ...codedError(exception, API_ERROR_CODES.internalError),
      code,
    };
    const { httpAdapter } = this.adapterHost;
    const response: unknown = host.switchToHttp().getResponse();
    if (httpAdapter.isHeadersSent(response)) httpAdapter.end(response);
    else httpAdapter.reply(response, body, status);
  }
}
