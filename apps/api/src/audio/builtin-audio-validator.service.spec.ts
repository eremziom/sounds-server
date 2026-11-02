import { ConfigService } from '@nestjs/config';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { BuiltinAudioValidatorService } from './builtin-audio-validator.service';
import { LocalAudioStorageService } from './local-audio-storage.service';

function wav(bits = 16, encoding = 1, extensible = false) {
  const samples = 20;
  const fmtSize = extensible ? 40 : 16;
  const bytes = bits / 8;
  const header = Buffer.alloc(28 + fmtSize);
  header.write('RIFF');
  header.writeUInt32LE(header.length + samples * bytes - 8, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(fmtSize, 16);
  header.writeUInt16LE(extensible ? 0xfffe : encoding, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(44100, 24);
  header.writeUInt32LE(44100 * bytes, 28);
  header.writeUInt16LE(bytes, 32);
  header.writeUInt16LE(bits, 34);
  if (extensible) {
    header.writeUInt16LE(22, 36);
    header.writeUInt16LE(bits, 38);
    header.writeUInt32LE(encoding, 44);
    Buffer.from('00001000800000aa00389b71', 'hex').copy(header, 48);
  }
  header.write('data', 20 + fmtSize);
  header.writeUInt32LE(samples * bytes, 24 + fmtSize);
  return Buffer.concat([header, Buffer.alloc(samples * bytes)]);
}

describe('Built-in audio validation (real workers and WASM)', () => {
  let root: string;
  let validator: BuiltinAudioValidatorService;
  let storage: LocalAudioStorageService;
  let mp3: Buffer;
  beforeAll(async () => {
    mp3 = await readFile(join(__dirname, 'fixtures/tone.mp3'));
  });
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'sounds-validator-'));
    const config = new ConfigService({ AUDIO_STORAGE_DIR: root });
    validator = new BuiltinAudioValidatorService(config);
    storage = new LocalAudioStorageService(config, validator);
    await storage.onModuleInit();
  });
  afterEach(async () => {
    jest.useRealTimers();
    await rm(root, { recursive: true, force: true });
  });

  async function validate(buffer: Buffer) {
    const file = join(root, 'untrusted-name.bin');
    await writeFile(file, buffer);
    return validator.validate(file);
  }

  it('initializes its worker assets and embedded decoder at startup', async () => {
    await expect(validator.onModuleInit()).resolves.toBeUndefined();
  });
  it('detects and decodes MP3 by content rather than extension', async () => {
    await expect(validate(mp3)).resolves.toEqual({
      extension: 'mp3',
      mimeType: 'audio/mpeg',
    });
  });
  it('supports MPEG-2.5 mono VBR', async () => {
    const file = await readFile(join(__dirname, 'fixtures/tone-mpeg25.mp3'));
    await expect(validate(file)).resolves.toHaveProperty('extension', 'mp3');
  });
  it('supports ID3v2 tags and ID3v1 trailers', async () => {
    const header = Buffer.from([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 16]);
    const trailer = Buffer.alloc(128);
    trailer.write('TAG');
    await expect(
      validate(Buffer.concat([header, Buffer.alloc(16), mp3, trailer])),
    ).resolves.toHaveProperty('extension', 'mp3');
  });
  it('checks all frames beyond the read buffer boundary', async () => {
    await expect(
      validate(Buffer.concat(Array.from({ length: 20 }, () => mp3))),
    ).resolves.toHaveProperty('extension', 'mp3');
    const corrupted = Buffer.concat(Array.from({ length: 20 }, () => mp3));
    corrupted[mp3.length * 19] = 0;
    await expect(validate(corrupted)).rejects.toMatchObject({
      response: { code: 'AUDIO_FILE_INVALID' },
    });
  });
  it.each([
    ['truncated frame', () => mp3.subarray(0, -10)],
    ['trailing junk', () => Buffer.concat([mp3, Buffer.from('junk')])],
    [
      'metadata without audio',
      () => Buffer.from([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0]),
    ],
    [
      'invalid ID3 size',
      () => Buffer.from([0x49, 0x44, 0x33, 4, 0, 0, 0xff, 0, 0, 0]),
    ],
    [
      'damaged compressed payload',
      () => {
        const data = Buffer.from(mp3);
        data.fill(0xff, 4, 417);
        return data;
      },
    ],
  ])('rejects MP3 with %s', async (_name, buffer) => {
    await expect(validate(buffer())).rejects.toMatchObject({
      response: { code: 'AUDIO_FILE_INVALID' },
    });
  });
  it.each([8, 16, 24, 32])('supports PCM WAV with %i bits', async (bits) => {
    await expect(validate(wav(bits))).resolves.toEqual({
      extension: 'wav',
      mimeType: 'audio/wav',
    });
  });
  it.each([32, 64])(
    'supports floating-point WAV with %i bits',
    async (bits) => {
      await expect(validate(wav(bits, 3))).resolves.toHaveProperty(
        'extension',
        'wav',
      );
    },
  );
  it.each([1, 3])(
    'supports WAVE_FORMAT_EXTENSIBLE encoding %i',
    async (encoding) => {
      await expect(validate(wav(32, encoding, true))).resolves.toHaveProperty(
        'extension',
        'wav',
      );
    },
  );
  it.each([
    ['truncated data', () => wav().subarray(0, -1)],
    [
      'inconsistent byte rate',
      () => {
        const data = wav();
        data.writeUInt32LE(1, 28);
        return data;
      },
    ],
    [
      'partial sample',
      () => {
        const data = wav();
        data.writeUInt32LE(39, 40);
        return data;
      },
    ],
    [
      'no data samples',
      () => {
        const data = wav().subarray(0, 44);
        data.writeUInt32LE(36, 4);
        data.writeUInt32LE(0, 40);
        return data;
      },
    ],
    [
      'NaN sample',
      () => {
        const data = wav(32, 3);
        data.writeFloatLE(NaN, 44);
        return data;
      },
    ],
    [
      'infinite sample',
      () => {
        const data = wav(64, 3);
        data.writeDoubleLE(Infinity, 44);
        return data;
      },
    ],
  ])('rejects WAV with %s', async (_name, buffer) => {
    await expect(validate(buffer())).rejects.toMatchObject({
      response: { code: 'AUDIO_FILE_INVALID' },
    });
  });
  it('rejects compressed WAV encodings', async () => {
    await expect(validate(wav(8, 7))).rejects.toMatchObject({
      response: { code: 'AUDIO_FORMAT_UNSUPPORTED' },
    });
  });
  it('rejects a fake MP3 filename and empty input', async () => {
    await expect(validate(Buffer.from('not audio'))).rejects.toMatchObject({
      response: { code: 'AUDIO_FORMAT_UNSUPPORTED' },
    });
    await expect(validate(Buffer.alloc(0))).rejects.toMatchObject({
      response: { code: 'AUDIO_FILE_INVALID' },
    });
  });
  it('enforces the byte limit again on the file being validated', async () => {
    validator = new BuiltinAudioValidatorService(
      new ConfigService({ AUDIO_STORAGE_DIR: root, AUDIO_MAX_FILE_BYTES: '8' }),
    );
    await expect(validate(mp3)).rejects.toMatchObject({
      response: { code: 'AUDIO_FILE_TOO_LARGE' },
    });
  });
  it('commits a validated MP3 and derives its key and MIME from content', async () => {
    const file = await storage.writeTemporary(Readable.from([mp3]));
    const saved = await storage.commit(file.temporaryKey);
    expect(saved).toMatchObject({
      sizeBytes: mp3.length,
      mimeType: 'audio/mpeg',
    });
    expect(saved.storageKey).toMatch(/\.mp3$/);
  });
  it('reports unavailable files without exposing paths', async () => {
    await expect(
      validator.validate(join(root, 'missing')),
    ).rejects.toMatchObject({ response: { code: 'AUDIO_STORAGE_FAILED' } });
  });
  it('cancels work and frees the slot for subsequent validation', async () => {
    const controller = new AbortController();
    const pending = validator.validate(
      join(root, 'missing'),
      controller.signal,
    );
    controller.abort();
    await expect(pending).rejects.toHaveProperty('name', 'AbortError');
    await expect(validate(mp3)).resolves.toHaveProperty('extension', 'mp3');
  });
  it('bounds concurrent workers and releases slots after cancellation', async () => {
    const one = new AbortController();
    const two = new AbortController();
    const first = validator.validate(join(root, 'missing'), one.signal);
    const second = validator.validate(join(root, 'missing'), two.signal);
    const results = Promise.allSettled([first, second]);
    await expect(
      validator.validate(join(root, 'missing')),
    ).rejects.toMatchObject({
      response: { code: 'AUDIO_VALIDATION_UNAVAILABLE' },
    });
    one.abort();
    two.abort();
    await results;
    await expect(validate(mp3)).resolves.toHaveProperty('extension', 'mp3');
  });
  it('terminates validation when the time budget expires', async () => {
    jest.useFakeTimers();
    const pending = validator.validate(join(root, 'missing'));
    const expectation = expect(pending).rejects.toMatchObject({
      response: { code: 'AUDIO_VALIDATION_UNAVAILABLE' },
    });
    jest.advanceTimersByTime(120000);
    await expectation;
  });
});
