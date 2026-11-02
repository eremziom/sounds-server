import { HttpException } from '@nestjs/common';
import { API_ERROR_CODES, codedError } from '../common/api-errors';

export function audioError(
  kind:
    | 'tooLarge'
    | 'unsupported'
    | 'invalid'
    | 'storage'
    | 'validationUnavailable',
) {
  const [status, message, code] = (
    {
      tooLarge: [
        413,
        'Audio file exceeds the configured limit',
        API_ERROR_CODES.audioTooLarge,
      ],
      unsupported: [
        415,
        'Unsupported audio format or encoding',
        API_ERROR_CODES.audioUnsupported,
      ],
      invalid: [
        400,
        'Invalid or empty audio file',
        API_ERROR_CODES.audioInvalid,
      ],
      storage: [
        503,
        'Audio storage operation failed',
        API_ERROR_CODES.audioStorageFailed,
      ],
      validationUnavailable: [
        503,
        'Audio validation unavailable',
        API_ERROR_CODES.audioValidationUnavailable,
      ],
    } as const
  )[kind];
  const exception = new HttpException(message, status);
  return new HttpException(codedError(exception, code), status);
}
