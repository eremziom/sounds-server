import { BadRequestException, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import busboy from 'busboy';
import { LocalAudioStorageService } from '../audio/local-audio-storage.service';
import type { TemporaryAudio } from '../audio/local-audio-storage.service';
import { audioError } from '../audio/audio-errors';
import { createApiValidationPipe } from '../common/api-validation.pipe';
import type { AuthenticatedRequest } from '../auth/auth.interfaces';
import { CreateTrackDto } from './create-track.dto';
import { TracksService } from './tracks.service';
import { AUDIO_FORMATS } from '../audio/audio-formats';

@Injectable()
export class TrackUploadService {
  constructor(
    private readonly storage: LocalAudioStorageService,
    private readonly tracks: TracksService,
  ) {}

  getConfig() {
    return { maxFileBytes: this.storage.maxFileBytes, formats: AUDIO_FORMATS };
  }

  async upload(request: Request & AuthenticatedRequest, response: Response) {
    if (!request.is('multipart/form-data')) {
      throw new BadRequestException('Expected multipart/form-data');
    }
    let parser: ReturnType<typeof busboy>;
    try {
      parser = busboy({
        headers: request.headers,
        defParamCharset: 'utf8',
        limits: {
          files: 1,
          fields: 1,
          parts: 3,
          fieldSize: 8192,
          fieldNameSize: 100,
        },
      });
    } catch {
      throw new BadRequestException('Invalid multipart boundary');
    }

    const abort = new AbortController();
    let failure: Error | undefined;
    let temporary: TemporaryAudio | undefined;
    let stored:
      | Awaited<ReturnType<LocalAudioStorageService['commit']>>
      | undefined;
    let fileWrite: Promise<void> | undefined;
    let metadata: string | undefined;
    let originalName: string | undefined;
    let saved = false;
    const fail = (error: Error) => {
      failure ??= error;
      abort.abort();
      request.unpipe(parser);
      // Stop parsing and release the file stream even when a part was incomplete.
      queueMicrotask(() => parser.destroy());
      request.resume();
    };
    const disconnected = () =>
      fail(new BadRequestException('Upload interrupted'));
    const responseClosed = () => {
      if (!response.writableEnded) disconnected();
    };
    request.once('aborted', disconnected);
    request.once('error', disconnected);
    response.once('close', responseClosed);

    const parsed = new Promise<void>((resolve) => {
      parser.once('close', resolve);
      parser.once('error', () =>
        fail(new BadRequestException('Malformed multipart form')),
      );
      for (const event of [
        'filesLimit',
        'fieldsLimit',
        'partsLimit',
      ] as const) {
        parser.once(event, () =>
          fail(new BadRequestException('Too many multipart parts')),
        );
      }
      parser.on('field', (name, value, info) => {
        if (
          name !== 'metadata' ||
          metadata !== undefined ||
          info.valueTruncated ||
          info.nameTruncated
        ) {
          fail(new BadRequestException('Expected one bounded metadata field'));
          return;
        }
        metadata = value;
      });
      parser.on('file', (name, stream, info) => {
        // Busboy can fail the part before the async disk open attaches pipeline.
        stream.on('error', () =>
          fail(new BadRequestException('Incomplete multipart file')),
        );
        if (
          failure ||
          name !== 'file' ||
          !info.filename ||
          Buffer.byteLength(info.filename) > 1024
        ) {
          stream.resume();
          fail(new BadRequestException('Expected one named file'));
          return;
        }
        originalName = info.filename;
        fileWrite = this.storage
          .writeTemporary(stream, abort.signal)
          .then((file) => {
            temporary = file;
          })
          .catch((error: Error) => {
            fail(error);
          });
      });
    });

    try {
      request.pipe(parser);
      if (request.aborted || response.destroyed) disconnected();
      await parsed;
      await fileWrite;
      if (failure) throw failure;
      if (!temporary || !originalName || metadata === undefined) {
        throw new BadRequestException('Both file and metadata are required');
      }
      let data: unknown;
      try {
        data = JSON.parse(metadata);
      } catch {
        throw new BadRequestException('Metadata must be valid JSON');
      }
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new BadRequestException('Metadata must be an object');
      }
      const dto = (await createApiValidationPipe().transform(data, {
        type: 'body',
        metatype: CreateTrackDto,
      })) as CreateTrackDto;
      abort.signal.throwIfAborted();
      stored = await this.storage.commit(temporary.temporaryKey, abort.signal);
      temporary = undefined;
      abort.signal.throwIfAborted();
      const track = await this.tracks.createWithAudio(
        dto,
        request.user.userId,
        {
          ...stored,
          originalName,
        },
      );
      // Once the DB commits, a disconnected client must not remove the saved file.
      saved = true;
      return track;
    } finally {
      request.unpipe(parser);
      request.removeListener('aborted', disconnected);
      request.removeListener('error', disconnected);
      response.removeListener('close', responseClosed);
      await this.cleanup(
        temporary,
        stored && !saved ? stored.storageKey : undefined,
      );
    }
  }

  private async cleanup(temporary?: TemporaryAudio, storageKey?: string) {
    const results = await Promise.allSettled([
      ...(temporary ? [this.storage.discard(temporary.temporaryKey)] : []),
      ...(storageKey ? [this.storage.remove(storageKey)] : []),
    ]);
    if (results.some((result) => result.status === 'rejected'))
      throw audioError('storage');
  }
}
