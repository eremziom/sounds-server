import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type { PrismaService } from '../prisma/prisma.service';
import { cleanupAudio, type CleanupEvent } from './audio-cleanup';

describe('Audio cleanup failure recovery', () => {
  let root: string;
  let file: string;
  const now = new Date(Date.now() + 72 * 3600000);
  const tx = {
    audioFile: { findUnique: jest.fn().mockResolvedValue(null) },
    audioUpload: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  let beforeTransaction: () => Promise<void>;
  const prisma = {
    audioUpload: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: async (callback: (client: typeof tx) => Promise<void>) => {
      await beforeTransaction();
      return callback(tx);
    },
  } as unknown as PrismaService;
  beforeEach(async () => {
    beforeTransaction = async () => {};
    root = await fs.mkdtemp(join(tmpdir(), 'sounds-cleanup-unit-'));
    await fs.mkdir(join(root, 'tmp'));
    await fs.mkdir(join(root, 'files'));
    file = join(root, 'files', `${randomUUID()}.wav`);
    await fs.writeFile(file, 'old bytes');
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    expect(dirname(resolve(root))).toBe(resolve(tmpdir()));
    expect(root.split(/[\\/]/).pop()).toMatch(/^sounds-cleanup-unit-/);
    await fs.rm(root, { recursive: true, force: true });
  });
  it('reports disk failure without losing the file, then retries successfully', async () => {
    const events: CleanupEvent[] = [];
    const unlink = jest.spyOn(fs, 'unlink').mockRejectedValueOnce(
      Object.assign(new Error('private filesystem detail'), {
        code: 'EACCES',
      }),
    );
    const result = await cleanupAudio(prisma, root, {
      delete: true,
      now,
      report: (event) => events.push(event),
    });
    expect(result.errors).toBe(1);
    expect(result.removed).toBe(0);
    expect(await fs.readFile(file, 'utf8')).toBe('old bytes');
    expect(JSON.stringify(events)).not.toContain('private filesystem detail');
    unlink.mockRestore();
    const retry = await cleanupAudio(prisma, root, {
      delete: true,
      now,
      report() {},
    });
    expect(retry.errors).toBe(0);
    expect(retry.removed).toBe(1);
    await expect(fs.lstat(file)).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('preserves a candidate changed after scanning and before deletion', async () => {
    beforeTransaction = () => fs.writeFile(file, 'changed bytes after scan');
    const events: CleanupEvent[] = [];
    const result = await cleanupAudio(prisma, root, {
      delete: true,
      now,
      report: (event) => events.push(event),
    });
    expect(result.errors).toBe(0);
    expect(result.removed).toBe(0);
    expect(events).toContainEqual(
      expect.objectContaining({ action: 'skip', reason: 'changed' }),
    );
    expect(await fs.readFile(file, 'utf8')).toBe('changed bytes after scan');
  });
});
