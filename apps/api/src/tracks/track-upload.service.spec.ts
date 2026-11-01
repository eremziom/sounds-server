import { INestApplication } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request as httpRequest } from 'node:http';
import type { Server, AddressInfo } from 'node:net';
import request from 'supertest';

jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import { PrismaService } from '../prisma/prisma.service';
import { PrismaModule } from '../prisma/prisma.module';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApiExceptionFilter } from '../common/api-exception.filter';
import { createApiValidationPipe } from '../common/api-validation.pipe';
import { AudioModule } from '../audio/audio.module';
import { LocalAudioStorageService } from '../audio/local-audio-storage.service';
import { audioError } from '../audio/audio-errors';
import { TracksModule } from './tracks.module';

const metadata = {
  title: 'Upload test',
  description: 'Synthetic recording',
  releaseDate: '2026-01-01',
  bpm: { bpmFrom: 120, bpmTo: 130 },
};

function wav() {
  const bytes = Buffer.alloc(48);
  bytes.write('RIFF');
  bytes.writeUInt32LE(40, 4);
  bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8000, 24);
  bytes.writeUInt32LE(16000, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(4, 40);
  return bytes;
}

describe('Track upload HTTP and filesystem', () => {
  let app: INestApplication;
  let server: Server;
  let directory: string;
  let storage: LocalAudioStorageService;
  const create = jest.fn();
  const user = jest.fn();

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'sounds-upload-'));
    const module = await Test.createTestingModule({
      imports: [PrismaModule, TracksModule, AudioModule],
      providers: [
        {
          provide: PrismaService,
          useValue: { track: { create }, user: { findUnique: user } },
        },
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
      ],
    })
      .overrideProvider(PrismaService)
      .useValue({ track: { create }, user: { findUnique: user } })
      .overrideProvider(ConfigService)
      .useValue(
        new ConfigService({
          AUDIO_STORAGE_DIR: directory,
          AUDIO_MAX_FILE_BYTES: '16384',
        }),
      )
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          const req = context.switchToHttp().getRequest<{
            user?: { userId: number };
            headers: Record<string, string>;
          }>();
          if (req.headers.authorization) req.user = { userId: 42 };
          // PermissionsGuard also rejects missing authentication before reading the body.
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.useLogger(false);
    app.useGlobalPipes(createApiValidationPipe());
    await app.listen(0, '127.0.0.1');
    server = app.getHttpServer() as Server;
    storage = app.get(LocalAudioStorageService);
  });

  beforeEach(() => {
    jest.restoreAllMocks();
    user.mockResolvedValue({
      isActive: true,
      roles: [
        { role: { permissions: [{ permission: { key: 'tracks:create' } }] } },
      ],
    });
    create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({
        ...data,
        id: 1,
        audioFile: { id: 1 },
      }),
    );
    create.mockClear();
  });

  afterEach(async () => {
    expect(await readdir(join(directory, 'tmp'))).toEqual([]);
    for (const name of await readdir(join(directory, 'files'))) {
      await rm(join(directory, 'files', name));
    }
  });
  afterAll(async () => {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  });

  const upload = (data: unknown = metadata) =>
    request(server)
      .post('/tracks/upload')
      .set('Authorization', 'test-session')
      .field('metadata', JSON.stringify(data));

  it.each(['wav', 'mp3'])(
    'stores valid %s by content and returns private-safe track metadata',
    async (format) => {
      const bytes =
        format === 'wav'
          ? wav()
          : await readFile(join(__dirname, '../audio/fixtures/tone.mp3'));
      const response = await upload()
        .attach('file', bytes, {
          filename: '../../nagranie.bin',
          contentType: 'application/octet-stream',
        })
        .expect(201);
      expect(response.body).toMatchObject({
        ownerId: 42,
        hasAudio: true,
        title: metadata.title,
      });
      expect(response.body).not.toHaveProperty('audioFile');
      const files = await readdir(join(directory, 'files'));
      expect(files).toHaveLength(1);
      expect(files[0]).toMatch(new RegExp(`\\.${format}$`));
      expect(await readFile(join(directory, 'files', files[0]))).toEqual(bytes);
      expect(create.mock.calls).toHaveLength(1);
      expect(create.mock.calls[0]).toHaveProperty('0.data.ownerId', 42);
      expect(create.mock.calls[0]).toHaveProperty(
        '0.data.audioFile.create.sizeBytes',
        bytes.length,
      );
      expect(create.mock.calls[0]).toHaveProperty(
        '0.data.audioFile.create.originalName',
        'nagranie.bin',
      );
    },
  );

  it('accepts metadata after the streamed file', async () => {
    await request(server)
      .post('/tracks/upload')
      .set('Authorization', 'session')
      .attach('file', wav(), 'tone.wav')
      .field('metadata', JSON.stringify(metadata))
      .expect(201);
  });

  it.each([
    ['owner injection', { ...metadata, ownerId: 999 }],
    [
      'missing BPM',
      {
        title: metadata.title,
        description: metadata.description,
        releaseDate: metadata.releaseDate,
      },
    ],
    ['invalid BPM', { ...metadata, bpm: { bpmFrom: 180, bpmTo: 100 } }],
    ['invalid date', { ...metadata, releaseDate: 'invalid' }],
    ['non-object', []],
  ])('rejects %s and cleans received bytes', async (_name, data) => {
    await upload(data).attach('file', wav(), 'tone.wav').expect(400);
    expect(create).not.toHaveBeenCalled();
    expect(await readdir(join(directory, 'files'))).toEqual([]);
  });

  it('rejects malformed JSON with no leftover file', async () => {
    await request(server)
      .post('/tracks/upload')
      .set('Authorization', 'session')
      .field('metadata', '{broken')
      .attach('file', wav(), 'tone.wav')
      .expect(400);
    expect(create).not.toHaveBeenCalled();
  });

  it.each([Buffer.alloc(0), Buffer.from('not an MP3')])(
    'rejects empty or disguised audio',
    async (bytes) => {
      await upload()
        .attach('file', bytes, 'fake.mp3')
        .expect(bytes.length ? 415 : 400);
      expect(create).not.toHaveBeenCalled();
      expect(await readdir(join(directory, 'files'))).toEqual([]);
    },
  );

  it('enforces the byte limit during receipt', async () => {
    const response = await upload()
      .attach('file', Buffer.alloc(16385), 'large.wav')
      .expect(413);
    expect(response.body).toHaveProperty('code', 'AUDIO_FILE_TOO_LARGE');
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects extra files and text parts', async () => {
    await upload()
      .attach('file', wav(), 'one.wav')
      .attach('file', wav(), 'two.wav')
      .expect(400);
    await upload()
      .field('other', 'unexpected')
      .attach('file', wav(), 'one.wav')
      .expect(400);
    await upload()
      .field('metadata', JSON.stringify(metadata))
      .attach('file', wav(), 'one.wav')
      .expect(400);
    await upload().field('other', 'x'.repeat(8193)).expect(400);
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects missing parts and invalid content types', async () => {
    await upload().expect(400);
    await request(server)
      .post('/tracks/upload')
      .set('Authorization', 'session')
      .attach('file', wav(), 'tone.wav')
      .expect(400);
    await request(server)
      .post('/tracks/upload')
      .set('Authorization', 'session')
      .send(metadata)
      .expect(400);
    await request(server)
      .post('/tracks/upload')
      .set('Authorization', 'session')
      .set('Content-Type', 'multipart/form-data')
      .send('missing boundary')
      .expect(400);
    expect(create).not.toHaveBeenCalled();
  });

  it('authorizes before opening a temporary file', async () => {
    const write = jest.spyOn(storage, 'writeTemporary');
    await request(server)
      .post('/tracks/upload')
      .field('metadata', JSON.stringify(metadata))
      .attach('file', wav(), 'tone.wav')
      .expect(401);
    user.mockResolvedValue({ isActive: true, roles: [] });
    await upload().attach('file', wav(), 'tone.wav').expect(403);
    expect(write).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('removes the final file when the atomic database write fails', async () => {
    create.mockRejectedValueOnce(new Error('simulated database failure'));
    await upload().attach('file', wav(), 'tone.wav').expect(500);
    expect(await readdir(join(directory, 'files'))).toEqual([]);
  });

  it('cleans temporary bytes when commit fails', async () => {
    jest.spyOn(storage, 'commit').mockRejectedValueOnce(audioError('storage'));
    await upload().attach('file', wav(), 'tone.wav').expect(503);
    expect(create).not.toHaveBeenCalled();
  });

  it('cleans a malformed unfinished file part', async () => {
    await request(server)
      .post('/tracks/upload')
      .set('Authorization', 'session')
      .set('Content-Type', 'multipart/form-data; boundary=broken')
      .send(
        '--broken\r\nContent-Disposition: form-data; name="file"; filename="tone.wav"\r\nContent-Type: audio/wav\r\n\r\npartial',
      )
      .expect(400);
    expect(create).not.toHaveBeenCalled();
  });

  it('cleans an interrupted network transfer', async () => {
    let started!: () => void;
    const receiving = new Promise<void>((resolve) => {
      started = resolve;
    });
    const original = storage.writeTemporary.bind(
      storage,
    ) as LocalAudioStorageService['writeTemporary'];
    let finished!: () => void;
    const cleaned = new Promise<void>((resolve) => {
      finished = resolve;
    });
    jest
      .spyOn(storage, 'writeTemporary')
      .mockImplementation(async (...args) => {
        started();
        try {
          return await original(...args);
        } finally {
          finished();
        }
      });
    const socket = httpRequest({
      host: '127.0.0.1',
      port: (server.address() as AddressInfo).port,
      path: '/tracks/upload',
      method: 'POST',
      headers: {
        Authorization: 'session',
        'Content-Type': 'multipart/form-data; boundary=interrupt',
      },
    });
    socket.on('error', () => {});
    socket.write(
      '--interrupt\r\nContent-Disposition: form-data; name="file"; filename="tone.wav"\r\nContent-Type: audio/wav\r\n\r\npartial',
    );
    await receiving;
    socket.destroy();
    await cleaned;
    expect(create).not.toHaveBeenCalled();
  });
});
