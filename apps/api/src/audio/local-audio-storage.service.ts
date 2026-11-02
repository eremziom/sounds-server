import {
  Injectable,
  Logger,
  OnModuleInit,
  HttpException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { link, lstat, mkdir, open, realpath, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { assertPrivateDirectory, readAudioConfig } from './audio-config';
import { audioError } from './audio-errors';
import { AudioValidatorService } from './audio-validator.service';

export interface TemporaryAudio {
  temporaryKey: string;
  sizeBytes: number;
}

const uuid =
  '[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}';
const temporaryPattern = new RegExp(`^${uuid}\\.tmp$`);
const storagePattern = new RegExp(`^${uuid}\\.(mp3|wav)$`);

@Injectable()
export class LocalAudioStorageService implements OnModuleInit {
  private readonly logger = new Logger(LocalAudioStorageService.name);
  private directory: string;
  private ready = false;
  private limit: number;

  constructor(
    private readonly config: ConfigService,
    private readonly validator: AudioValidatorService,
  ) {}

  get maxFileBytes() {
    this.assertReady();
    return this.limit;
  }

  async onModuleInit() {
    const config = readAudioConfig(this.config);
    this.directory = config.directory;
    this.limit = config.maxFileBytes;
    for (const directory of [this.directory, this.tmpDir, this.filesDir]) {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const info = await lstat(directory);
      if (!info.isDirectory() || info.isSymbolicLink()) {
        throw new Error('Audio storage directories must not be symbolic links');
      }
      assertPrivateDirectory(await realpath(directory));
      const probe = join(directory, `${randomUUID()}.probe`);
      const handle = await open(probe, 'wx', 0o600);
      try {
        await handle.writeFile('audio-storage-check');
      } finally {
        await handle.close();
        await unlink(probe);
      }
    }
    this.ready = true;
  }

  private get tmpDir() {
    return join(this.directory, 'tmp');
  }
  private get filesDir() {
    return join(this.directory, 'files');
  }

  private assertReady() {
    if (!this.ready) throw new Error('Audio storage has not been initialized');
  }

  private pathFor(key: string, temporary: boolean) {
    this.assertReady();
    if (!(temporary ? temporaryPattern : storagePattern).test(key)) {
      throw audioError('storage');
    }
    return join(temporary ? this.tmpDir : this.filesDir, key);
  }

  private async removePath(path: string) {
    try {
      await unlink(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  private async cleanAfterFailure(path: string) {
    try {
      await this.removePath(path);
    } catch {
      this.logger.error(
        'Failed to remove an audio file after an unsuccessful operation',
      );
      throw audioError('storage');
    }
  }

  async writeTemporary(
    source: Readable,
    signal?: AbortSignal,
  ): Promise<TemporaryAudio> {
    const temporaryKey = `${randomUUID()}.tmp`;
    const path = this.pathFor(temporaryKey, true);
    let sizeBytes = 0;
    const limit = this.limit;
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        sizeBytes += chunk.length;
        callback(sizeBytes > limit ? audioError('tooLarge') : null, chunk);
      },
    });
    let created = false;
    try {
      const handle = await open(path, 'wx', 0o600);
      created = true;
      await pipeline(source, limiter, handle.createWriteStream(), { signal });
      if (sizeBytes === 0) throw audioError('invalid');
      return { temporaryKey, sizeBytes };
    } catch (error) {
      source.destroy();
      if (created) await this.cleanAfterFailure(path);
      if (
        error instanceof HttpException ||
        (error as Error).name === 'AbortError'
      )
        throw error;
      throw audioError('storage');
    }
  }

  async commit(temporaryKey: string, signal?: AbortSignal) {
    const source = this.pathFor(temporaryKey, true);
    let destination: string | undefined;
    let linked = false;
    try {
      const info = await lstat(source);
      if (!info.isFile() || info.isSymbolicLink()) throw audioError('invalid');
      if (info.size > this.limit) throw audioError('tooLarge');
      if (info.size === 0) throw audioError('invalid');
      const format = await this.validator.validate(source, signal);
      const storageKey = `${randomUUID()}.${format.extension}`;
      destination = this.pathFor(storageKey, false);
      // Exclusive creation on the same volume; never overwrite a stored file.
      await link(source, destination);
      linked = true;
      await unlink(source);
      return { storageKey, mimeType: format.mimeType, sizeBytes: info.size };
    } catch (error) {
      const cleaned = await Promise.allSettled([
        this.cleanAfterFailure(source),
        ...(destination && linked ? [this.cleanAfterFailure(destination)] : []),
      ]);
      if (cleaned.some((result) => result.status === 'rejected'))
        throw audioError('storage');
      if (
        error instanceof HttpException ||
        (error as Error).name === 'AbortError'
      )
        throw error;
      throw audioError('storage');
    }
  }

  async openRead(storageKey: string, range?: { start: number; end: number }) {
    const path = this.pathFor(storageKey, false);
    if (
      range &&
      (!Number.isSafeInteger(range.start) ||
        !Number.isSafeInteger(range.end) ||
        range.start < 0 ||
        range.end < range.start)
    ) {
      throw audioError('storage');
    }
    try {
      if ((await lstat(path)).isSymbolicLink()) throw audioError('storage');
      const handle = await open(
        path,
        constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
      );
      try {
        const info = await handle.stat();
        if (!info.isFile() || (range && range.end >= info.size))
          throw audioError('storage');
        return { sizeBytes: info.size, stream: handle.createReadStream(range) };
      } catch (error) {
        await handle.close();
        throw error;
      }
    } catch {
      throw audioError('storage');
    }
  }

  async discard(temporaryKey: string) {
    await this.cleanAfterFailure(this.pathFor(temporaryKey, true));
  }

  async remove(storageKey: string) {
    await this.cleanAfterFailure(this.pathFor(storageKey, false));
  }
}
