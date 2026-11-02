import { ConfigService } from '@nestjs/config';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { LocalAudioStorageService } from './local-audio-storage.service';
import { AudioValidatorService } from './audio-validator.service';
import { audioError } from './audio-errors';
import { readAudioConfig } from './audio-config';

describe('Local audio storage', () => {
  let root: string;
  let storage: LocalAudioStorageService;
  let validator: AudioValidatorService;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'sounds-audio-'));
    validator = {
      validate: jest
        .fn()
        .mockResolvedValue({ extension: 'mp3', mimeType: 'audio/mpeg' }),
    };
    storage = new LocalAudioStorageService(
      new ConfigService({
        AUDIO_STORAGE_DIR: root,
        AUDIO_MAX_FILE_BYTES: '8',
      }),
      validator,
    );
    await storage.onModuleInit();
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('streams to a private temporary file, commits and reads by generated key', async () => {
    const temporary = await storage.writeTemporary(
      Readable.from([Buffer.from('abc'), Buffer.from('defgh')]),
    );
    expect(temporary.sizeBytes).toBe(8);
    expect(await readdir(join(root, 'files'))).toEqual([]);
    const audio = await storage.commit(temporary.temporaryKey);
    expect(audio).toMatchObject({ sizeBytes: 8, mimeType: 'audio/mpeg' });
    expect(audio.storageKey).toMatch(/^[a-f0-9-]{36}\.mp3$/);
    expect(await readdir(join(root, 'tmp'))).toEqual([]);
    const { stream, sizeBytes } = await storage.openRead(audio.storageKey);
    expect(sizeBytes).toBe(8);
    expect(
      (await stream.toArray())
        .map((chunk: Buffer) => chunk.toString())
        .join(''),
    ).toBe('abcdefgh');
    const ranged = await storage.openRead(audio.storageKey, {
      start: 2,
      end: 4,
    });
    expect(
      (await ranged.stream.toArray())
        .map((chunk: Buffer) => chunk.toString())
        .join(''),
    ).toBe('cde');
    await storage.remove(audio.storageKey);
    await storage.remove(audio.storageKey);
    expect(await readdir(join(root, 'files'))).toEqual([]);
  });

  it('enforces the byte limit during receipt and removes the partial file', async () => {
    let chunks = 0;
    const source = Readable.from(
      (function* () {
        for (let i = 0; i < 100; i++) {
          chunks++;
          yield Buffer.alloc(4);
        }
      })(),
      { highWaterMark: 1 },
    );
    await expect(storage.writeTemporary(source)).rejects.toMatchObject({
      response: { code: 'AUDIO_FILE_TOO_LARGE' },
    });
    expect(chunks).toBeLessThan(100);
    expect(source.destroyed).toBe(true);
    expect(await readdir(join(root, 'tmp'))).toEqual([]);
  });

  it('rejects empty files', async () => {
    await expect(
      storage.writeTemporary(Readable.from([])),
    ).rejects.toMatchObject({ response: { code: 'AUDIO_FILE_INVALID' } });
    expect(await readdir(join(root, 'tmp'))).toEqual([]);
  });

  it('cleans partial files after source failure or cancellation', async () => {
    const failed = Readable.from(
      (async function* () {
        yield Buffer.from('abc');
        await Promise.resolve();
        throw new Error('connection lost');
      })(),
    );
    await expect(storage.writeTemporary(failed)).rejects.toMatchObject({
      response: { code: 'AUDIO_STORAGE_FAILED' },
    });
    const controller = new AbortController();
    controller.abort();
    await expect(
      storage.writeTemporary(Readable.from(['abc']), controller.signal),
    ).rejects.toHaveProperty('name', 'AbortError');
    expect(await readdir(join(root, 'tmp'))).toEqual([]);
  });

  it('removes rejected audio after validation', async () => {
    jest.spyOn(validator, 'validate').mockRejectedValue(audioError('invalid'));
    const temporary = await storage.writeTemporary(Readable.from(['broken']));
    await expect(storage.commit(temporary.temporaryKey)).rejects.toMatchObject({
      response: { code: 'AUDIO_FILE_INVALID' },
    });
    expect(await readdir(join(root, 'tmp'))).toEqual([]);
    expect(await readdir(join(root, 'files'))).toEqual([]);
  });

  it('cleans temporary data after a destination disk error', async () => {
    const temporary = await storage.writeTemporary(Readable.from(['abc']));
    await rm(join(root, 'files'), { recursive: true });
    await writeFile(join(root, 'files'), 'blocked');
    await expect(storage.commit(temporary.temporaryKey)).rejects.toMatchObject({
      response: { code: 'AUDIO_STORAGE_FAILED' },
    });
    expect(await readdir(join(root, 'tmp'))).toEqual([]);
  });

  it.each(['../outside.mp3', '/etc/passwd', 'C:\\file.mp3', 'example.mp3'])(
    'rejects untrusted keys: %s',
    async (key) => {
      await expect(storage.openRead(key)).rejects.toMatchObject({
        response: { code: 'AUDIO_STORAGE_FAILED' },
      });
      await expect(storage.remove(key)).rejects.toMatchObject({
        response: { code: 'AUDIO_STORAGE_FAILED' },
      });
      await expect(storage.discard(key)).rejects.toMatchObject({
        response: { code: 'AUDIO_STORAGE_FAILED' },
      });
    },
  );

  it('fails startup if a storage path is a file', async () => {
    const file = join(root, 'not-a-directory');
    await writeFile(file, 'data');
    const invalid = new LocalAudioStorageService(
      new ConfigService({ AUDIO_STORAGE_DIR: file }),
      validator,
    );
    await expect(invalid.onModuleInit()).rejects.toThrow();
  });
});

describe('Audio storage configuration', () => {
  it('defaults to 50 MiB', () => {
    expect(
      readAudioConfig(new ConfigService({ AUDIO_STORAGE_DIR: tmpdir() }))
        .maxFileBytes,
    ).toBe(52428800);
  });
  it.each(['0', '-1', '1.5', '1e6', 'NaN', '2147483648', ''])(
    'rejects invalid byte limit %s',
    (limit) => {
      expect(() =>
        readAudioConfig(
          new ConfigService({
            AUDIO_STORAGE_DIR: tmpdir(),
            AUDIO_MAX_FILE_BYTES: limit,
          }),
        ),
      ).toThrow('AUDIO_MAX_FILE_BYTES');
    },
  );
  it.each(['public', 'src', 'dist', 'build', '.next'])(
    'rejects storage in %s',
    (name) => {
      expect(() =>
        readAudioConfig(
          new ConfigService({
            AUDIO_STORAGE_DIR: join(tmpdir(), name, 'audio'),
          }),
        ),
      ).toThrow('private data directory');
    },
  );
  it('rejects relative or missing storage paths', () => {
    for (const directory of [undefined, 'storage/audio']) {
      expect(() =>
        readAudioConfig(new ConfigService({ AUDIO_STORAGE_DIR: directory })),
      ).toThrow('absolute path');
    }
  });
});
