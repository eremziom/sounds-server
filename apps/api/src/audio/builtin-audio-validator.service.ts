import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import {
  AudioValidatorService,
  ValidatedAudioFormat,
} from './audio-validator.service';
import { audioError } from './audio-errors';
import { readAudioConfig } from './audio-config';

@Injectable()
export class BuiltinAudioValidatorService
  extends AudioValidatorService
  implements OnModuleInit
{
  private active = 0;
  constructor(private readonly config: ConfigService) {
    super();
  }

  async onModuleInit() {
    // Also verify that the worker assets are present in the production build.
    await this.runWorker({ selfTest: true });
  }

  async validate(
    path: string,
    signal?: AbortSignal,
  ): Promise<ValidatedAudioFormat> {
    return this.runWorker({ path }, signal);
  }

  private async runWorker(
    input: { path: string } | { selfTest: true },
    signal?: AbortSignal,
  ): Promise<ValidatedAudioFormat> {
    signal?.throwIfAborted();
    if (this.active >= 2) throw audioError('validationUnavailable');
    const { maxFileBytes } = readAudioConfig(this.config);
    this.active++;
    let worker: Worker | undefined;
    try {
      worker = new Worker(join(__dirname, 'worker/audio-validation.cjs'), {
        workerData: { ...input, maxFileBytes },
        resourceLimits: { maxOldGenerationSizeMb: 64, stackSizeMb: 4 },
      });
      const currentWorker = worker;
      return await new Promise<ValidatedAudioFormat>((resolve, reject) => {
        const timeout = setTimeout(
          () => finish(audioError('validationUnavailable')),
          120000,
        );
        const aborted = () => {
          const error = new Error('Audio validation aborted');
          error.name = 'AbortError';
          finish(error);
        };
        const finish = (error?: Error, format?: ValidatedAudioFormat) => {
          clearTimeout(timeout);
          signal?.removeEventListener('abort', aborted);
          if (error) reject(error);
          else resolve(format!);
        };
        signal?.addEventListener('abort', aborted, { once: true });
        currentWorker.once('error', () =>
          finish(audioError('validationUnavailable')),
        );
        currentWorker.once('exit', () =>
          finish(audioError('validationUnavailable')),
        );
        currentWorker.once('message', (message: unknown) => {
          if (!message || typeof message !== 'object')
            return finish(audioError('validationUnavailable'));
          if (
            'extension' in message &&
            (message.extension === 'mp3' || message.extension === 'wav')
          ) {
            return finish(undefined, {
              extension: message.extension,
              mimeType:
                message.extension === 'mp3' ? 'audio/mpeg' : 'audio/wav',
            });
          }
          const kind = 'error' in message ? message.error : undefined;
          finish(
            audioError(
              kind === 'invalid' ||
                kind === 'unsupported' ||
                kind === 'storage' ||
                kind === 'tooLarge'
                ? kind
                : 'validationUnavailable',
            ),
          );
        });
        if (signal?.aborted) aborted();
      });
    } catch (error) {
      if (worker) throw error;
      throw audioError('validationUnavailable');
    } finally {
      try {
        if (worker) await worker.terminate();
      } finally {
        this.active--;
      }
    }
  }
}
