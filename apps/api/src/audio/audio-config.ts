import { isAbsolute, normalize, parse, resolve } from 'node:path';
import type { ConfigService } from '@nestjs/config';

export interface AudioConfig {
  directory: string;
  maxFileBytes: number;
}

export function assertPrivateDirectory(directory: string) {
  const parts = normalize(directory)
    .slice(parse(directory).root.length)
    .split(/[\\/]/);
  const forbidden = new Set([
    'public',
    'src',
    'dist',
    'build',
    '.next',
    '.git',
    'node_modules',
  ]);
  if (
    parts.some((part) => forbidden.has(part.toLowerCase())) ||
    normalize(directory) === parse(directory).root
  ) {
    throw new Error(
      'AUDIO_STORAGE_DIR must be a private data directory outside source and build directories',
    );
  }
}

export function readAudioConfig(
  config: Pick<ConfigService, 'get'>,
): AudioConfig {
  const directory = config.get<string>('AUDIO_STORAGE_DIR');
  if (!directory || !isAbsolute(directory)) {
    throw new Error('AUDIO_STORAGE_DIR must be an absolute path');
  }
  assertPrivateDirectory(directory);
  const rawLimit = config.get<string>('AUDIO_MAX_FILE_BYTES') ?? '52428800';
  if (!/^[1-9]\d*$/.test(String(rawLimit))) {
    throw new Error('AUDIO_MAX_FILE_BYTES must be a positive integer');
  }
  const maxFileBytes = Number(rawLimit);
  // AudioFile.sizeBytes is a PostgreSQL INTEGER.
  if (!Number.isSafeInteger(maxFileBytes) || maxFileBytes > 2147483647) {
    throw new Error('AUDIO_MAX_FILE_BYTES must not exceed 2147483647');
  }
  return { directory: resolve(directory), maxFileBytes };
}
