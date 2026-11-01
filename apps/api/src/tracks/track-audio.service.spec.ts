import { INestApplication, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { get } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import type { Response as TestResponse } from 'supertest';

jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import { PrismaService } from '../prisma/prisma.service';
import { PrismaModule } from '../prisma/prisma.module';
import { JwtStrategy } from '../auth/jwt.strategy';
import { ApiExceptionFilter } from '../common/api-exception.filter';
import { createApiValidationPipe } from '../common/api-validation.pipe';
import { LocalAudioStorageService } from '../audio/local-audio-storage.service';
import { TracksModule } from './tracks.module';
import { audioError } from '../audio/audio-errors';

function binary(
  response: TestResponse,
  done: (error: Error | null, body?: Buffer) => void,
) {
  const chunks: Buffer[] = [];
  response.on('data', (chunk: Buffer) => chunks.push(chunk));
  response.once('end', () => done(null, Buffer.concat(chunks)));
  response.once('error', done);
}

describe('Protected audio read and deletion HTTP', () => {
  let app: INestApplication;
  let server: Server;
  let directory: string;
  let storage: LocalAudioStorageService;
  let bytes: Buffer;
  let audio: { storageKey: string; mimeType: string; sizeBytes: number } | null;
  let track: { ownerId: number | null } | null;
  let permissions: string[];
  let active: boolean;
  let sessionValid: boolean;
  let token: string;
  const findAudio = jest.fn(() => Promise.resolve(audio));
  const findTrack = jest.fn(() =>
    Promise.resolve(track && { ...track, audioFile: audio }),
  );
  const deleteTrack = jest.fn(() => {
    track = null;
    audio = null;
    return Promise.resolve({});
  });
  type Tx = {
    track: { findUnique: typeof findTrack; delete: typeof deleteTrack };
  };
  const transaction = jest.fn((work: (tx: Tx) => Promise<unknown>) =>
    work({ track: { findUnique: findTrack, delete: deleteTrack } }),
  );
  const findSession = jest.fn(() =>
    Promise.resolve(
      sessionValid
        ? { id: 'audio-session', expiresAt: new Date(Date.now() + 3600000) }
        : null,
    ),
  );
  const findUser = jest.fn(() =>
    Promise.resolve({
      isActive: active,
      roles: [
        {
          role: {
            permissions: permissions.map((key) => ({ permission: { key } })),
          },
        },
      ],
    }),
  );
  const jwt = new JwtService({ secret: 'audio-http-test-secret' });

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'sounds-audio-http-'));
    bytes = await readFile(join(__dirname, '../audio/fixtures/tone.mp3'));
    const module = await Test.createTestingModule({
      imports: [PrismaModule, TracksModule],
      providers: [
        JwtStrategy,
        ConfigService,
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
      ],
    })
      .overrideProvider(PrismaService)
      .useValue({
        audioFile: { findUnique: findAudio },
        track: { findUnique: findTrack, delete: deleteTrack },
        $transaction: transaction,
        user: { findUnique: findUser },
        authSession: { findFirst: findSession },
      })
      .overrideProvider(ConfigService)
      .useValue(
        new ConfigService({
          JWT_SECRET: 'audio-http-test-secret',
          AUDIO_STORAGE_DIR: directory,
          AUDIO_MAX_FILE_BYTES: '52428800',
        }),
      )
      .compile();
    app = module.createNestApplication();
    app.useLogger(false);
    app.useGlobalPipes(createApiValidationPipe());
    await app.listen(0, '127.0.0.1');
    server = app.getHttpServer() as Server;
    storage = app.get(LocalAudioStorageService);
    token = jwt.sign(
      { sid: 'audio-session', sub: 42, username: 'artist', roles: ['ADMIN'] },
      { expiresIn: '1h' },
    );
  });

  beforeEach(async () => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    active = true;
    sessionValid = true;
    permissions = ['tracks:read', 'tracks:delete-own'];
    track = { ownerId: 42 };
    const temporary = await storage.writeTemporary(Readable.from([bytes]));
    audio = await storage.commit(temporary.temporaryKey);
  });

  afterEach(async () => {
    for (const file of await readdir(join(directory, 'files')))
      await rm(join(directory, 'files', file));
    expect(await readdir(join(directory, 'tmp'))).toEqual([]);
  });
  afterAll(async () => {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  });

  const read = (range?: string) => {
    const req = request(server)
      .get('/tracks/1/audio')
      .set('Authorization', `Bearer ${token}`);
    return range === undefined ? req : req.set('Range', range);
  };
  const remove = () =>
    request(server).delete('/tracks/1').set('Authorization', `Bearer ${token}`);

  it('streams the complete recording with private headers', async () => {
    const response = await read().buffer(true).parse(binary).expect(200);
    expect(response.body).toEqual(bytes);
    expect(response.headers).toMatchObject({
      'content-type': 'audio/mpeg',
      'content-length': String(bytes.length),
      'accept-ranges': 'bytes',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    });
    expect(response.headers).not.toHaveProperty('content-range');
    expect(response.headers).not.toHaveProperty('content-disposition');
  });

  it.each([
    ['bytes=0-9', 0, 9],
    ['bytes=10-', 10, -1],
    ['bytes=-10', -10, -1],
    ['bytes=0-999999999999999999999999', 0, -1],
    ['bytes=-999999999999999999999999', 0, -1],
    ['bytes=0-0', 0, 0],
  ])('streams one bounded range %s', async (header, startInput, endInput) => {
    const start = startInput < 0 ? bytes.length + startInput : startInput;
    const end = endInput < 0 ? bytes.length - 1 : endInput;
    const response = await read(header).buffer(true).parse(binary).expect(206);
    expect(response.body).toEqual(bytes.subarray(start, end + 1));
    expect(response.headers).toMatchObject({
      'content-range': `bytes ${start}-${end}/${bytes.length}`,
      'content-length': String(end - start + 1),
      'accept-ranges': 'bytes',
      'cache-control': 'private, no-store',
    });
  });

  it.each([
    'bytes=999999999999999999999999-',
    'bytes=10-2',
    'bytes=-0',
    'bytes=-',
    'bytes=0-1,3-4',
    'items=0-1',
    'bytes=abc',
    'bytes=0-1.5',
  ])('rejects invalid range %s with 416', async (header) => {
    const open = jest.spyOn(storage, 'openRead');
    const response = await read(header).expect(416);
    expect(response.body).toHaveProperty('code', 'AUDIO_RANGE_INVALID');
    expect(response.headers).toMatchObject({
      'content-range': `bytes */${bytes.length}`,
      'cache-control': 'private, no-store',
    });
    expect(open).not.toHaveBeenCalled();
  });

  it('rejects a range starting at the file length', async () => {
    await read(`bytes=${bytes.length}-`).expect(416);
  });

  it('supports HEAD without a body and closes its file stream', async () => {
    let closed!: () => void;
    const complete = new Promise<void>((resolve) => {
      closed = resolve;
    });
    const original = storage.openRead.bind(
      storage,
    ) as LocalAudioStorageService['openRead'];
    jest.spyOn(storage, 'openRead').mockImplementation(async (...args) => {
      const opened = await original(...args);
      opened.stream.once('close', closed);
      return opened;
    });
    await request(server)
      .head('/tracks/1/audio')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect('Content-Length', String(bytes.length));
    await complete;
  });

  it('checks the session again on every seek', async () => {
    await read('bytes=0-9').expect(206);
    sessionValid = false;
    await read('bytes=10-19').expect(401);
    expect(findSession).toHaveBeenCalledTimes(2);
    expect(findAudio).toHaveBeenCalledTimes(1);
  });

  it('rejects missing/expired tokens and missing/inactive permissions before disk access', async () => {
    const open = jest.spyOn(storage, 'openRead');
    await request(server).get('/tracks/1/audio').expect(401);
    const expired = jwt.sign(
      { sid: 'audio-session', sub: 42, username: 'artist', roles: ['ADMIN'] },
      { expiresIn: -1 },
    );
    await request(server)
      .get('/tracks/1/audio')
      .set('Authorization', `Bearer ${expired}`)
      .expect(401);
    permissions = [];
    await read('bytes=0-9').expect(403);
    permissions = ['tracks:read'];
    active = false;
    await read().expect(403);
    expect(open).not.toHaveBeenCalled();
    expect(findAudio).not.toHaveBeenCalled();
  });

  it('returns 404 for missing audio (including historical tracks)', async () => {
    audio = null;
    await read().expect(404);
  });

  it('returns a safe storage error for a missing or changed file', async () => {
    const key = audio!.storageKey;
    await rm(join(directory, 'files', key));
    const missing = await read().expect(503);
    expect(missing.body).toHaveProperty('code', 'AUDIO_STORAGE_FAILED');
    await writeFile(join(directory, 'files', key), 'truncated');
    await read().expect(503);
  });

  it('returns a safe error for a read failure before headers', async () => {
    const original = storage.openRead.bind(
      storage,
    ) as LocalAudioStorageService['openRead'];
    jest.spyOn(storage, 'openRead').mockImplementation(async (...args) => {
      const opened = await original(...args);
      opened.stream._read = () => {
        opened.stream.destroy(new Error('private-disk-path'));
      };
      return opened;
    });
    const response = await read('bytes=0-9').expect(503);
    expect(response.body).toHaveProperty('code', 'AUDIO_STORAGE_FAILED');
    expect(response.text).not.toContain('private-disk-path');
    expect(response.headers).not.toHaveProperty('content-range');
  });

  it('closes the disk stream when the listener disconnects', async () => {
    // A large private fixture keeps the source alive until the connection closes.
    const key = audio!.storageKey;
    await writeFile(
      join(directory, 'files', key),
      Buffer.alloc(8 * 1024 * 1024),
    );
    audio!.sizeBytes = 8 * 1024 * 1024;
    let closed!: () => void;
    const complete = new Promise<void>((resolve) => {
      closed = resolve;
    });
    const original = storage.openRead.bind(
      storage,
    ) as LocalAudioStorageService['openRead'];
    jest.spyOn(storage, 'openRead').mockImplementation(async (...args) => {
      const opened = await original(...args);
      opened.stream.once('close', closed);
      return opened;
    });
    await new Promise<void>((resolve, reject) => {
      const connection = get(
        {
          host: '127.0.0.1',
          port: (server.address() as AddressInfo).port,
          path: '/tracks/1/audio',
          headers: { Authorization: `Bearer ${token}` },
        },
        (response) => {
          response.once('data', () => {
            response.destroy();
            connection.destroy();
            resolve();
          });
          response.once('error', () => {});
        },
      );
      connection.once('error', reject);
    });
    await complete;
  });

  it('deletes an owned track then removes its stored file', async () => {
    const key = audio!.storageKey;
    const original = storage.remove.bind(
      storage,
    ) as LocalAudioStorageService['remove'];
    const disk = jest
      .spyOn(storage, 'remove')
      .mockImplementation(async (storageKey) => {
        expect(track).toBeNull();
        expect(audio).toBeNull();
        await original(storageKey);
      });
    await remove().expect(200);
    expect(disk).toHaveBeenCalledWith(key);
    expect(deleteTrack).toHaveBeenCalledWith({ where: { id: 1, ownerId: 42 } });
    expect(await readdir(join(directory, 'files'))).toEqual([]);
    await remove().expect(404);
  });

  it.each([7, null])(
    'prevents delete-own from deleting owner %s',
    async (ownerId) => {
      track = { ownerId };
      await remove().expect(403);
      expect(deleteTrack).not.toHaveBeenCalled();
      expect(await readdir(join(directory, 'files'))).toHaveLength(1);
    },
  );

  it.each([7, null])(
    'allows delete-any to delete owner %s',
    async (ownerId) => {
      track = { ownerId };
      permissions = ['tracks:delete-any'];
      await remove().expect(200);
      expect(deleteTrack).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(await readdir(join(directory, 'files'))).toEqual([]);
    },
  );

  it('rejects unauthenticated deletion and read-only permissions', async () => {
    await request(server).delete('/tracks/1').expect(401);
    permissions = ['tracks:read'];
    await remove().expect(403);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('deletes a historical track without attempting disk removal', async () => {
    const disk = jest.spyOn(storage, 'remove');
    audio = null;
    permissions = ['tracks:delete-any'];
    track = { ownerId: null };
    await remove().expect(200);
    expect(disk).not.toHaveBeenCalled();
  });

  it('preserves the stored file when the database transaction fails', async () => {
    const disk = jest.spyOn(storage, 'remove');
    transaction.mockRejectedValueOnce(new Error('simulated commit failure'));
    await remove().expect(500);
    expect(disk).not.toHaveBeenCalled();
    expect(await readdir(join(directory, 'files'))).toHaveLength(1);
    expect(track).not.toBeNull();
  });

  it('returns 404 for a concurrent delete without touching the file', async () => {
    const disk = jest.spyOn(storage, 'remove');
    transaction.mockRejectedValueOnce({ code: 'P2025' });
    await remove().expect(404);
    expect(disk).not.toHaveBeenCalled();
  });

  it('logs a retryable orphan when disk cleanup fails after DB commit', async () => {
    const key = audio!.storageKey;
    const log = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    jest.spyOn(storage, 'remove').mockRejectedValueOnce(audioError('storage'));
    await remove().expect(200);
    expect(track).toBeNull();
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining(`storageKey=${key}`),
    );
    expect(await readdir(join(directory, 'files'))).toEqual([key]);
  });
});
