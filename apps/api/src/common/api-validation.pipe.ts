import {
  BadRequestException,
  HttpException,
  ValidationPipe,
} from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import { API_ERROR_CODES, codedError } from './api-errors';

export interface FieldError {
  field: string;
  code: string;
  params?: { min: number; max: number };
}

const ruleCodes: Record<string, string> = {
  isDefined: 'REQUIRED',
  isNotEmpty: 'REQUIRED',
  isEmail: 'EMAIL',
  isString: 'INVALID_TYPE',
  isUrl: 'URL',
  whitelistValidation: 'UNKNOWN_FIELD',
};

export function normalizeValidationErrors(
  errors: ValidationError[],
  parent = '',
): FieldError[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const rules = Object.keys(error.constraints ?? {}).map(
      (rule): FieldError => {
        // Only code and numeric bounds from trusted decorator metadata may leave here.
        const context: unknown = error.contexts?.[rule];
        if (rule === 'isLength' && context && typeof context === 'object') {
          const { min, max } = context as { min?: unknown; max?: unknown };
          if (
            typeof min === 'number' &&
            Number.isSafeInteger(min) &&
            min >= 0 &&
            typeof max === 'number' &&
            Number.isSafeInteger(max) &&
            max >= min
          )
            return { field, code: 'LENGTH', params: { min, max } };
        }
        if (
          rule === 'matches' &&
          context &&
          typeof context === 'object' &&
          'code' in context &&
          context.code === 'PASSWORD_COMPLEXITY'
        ) {
          return { field, code: 'PASSWORD_COMPLEXITY' };
        }
        return {
          field,
          code: Object.hasOwn(ruleCodes, rule)
            ? ruleCodes[rule]
            : 'INVALID_VALUE',
        };
      },
    );
    return [
      ...rules,
      ...normalizeValidationErrors(error.children ?? [], field),
    ];
  });
}

export function createApiValidationPipe() {
  const options = { whitelist: true, forbidNonWhitelisted: true };
  const legacyException = new ValidationPipe(options).createExceptionFactory();
  return new ValidationPipe({
    ...options,
    validationError: { target: false, value: false },
    exceptionFactory: (errors: ValidationError[]) => {
      const exception = legacyException(errors);
      if (!(exception instanceof HttpException)) throw exception;
      return new BadRequestException({
        ...codedError(exception, API_ERROR_CODES.validationFailed),
        fieldErrors: normalizeValidationErrors(errors),
      });
    },
  });
}
