import { ConfigService } from '@nestjs/config';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ArtworkStorageService } from './artwork-storage.service';

describe('private artwork storage', () => {
  let directory: string;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'sounds-artworks-'));
  });
  afterEach(async () => {
    await rm(directory, { recursive: true });
  });
  const storage = (values: Record<string, string>) =>
    new ArtworkStorageService(new ConfigService(values));

  it('fails only creator storage use when configuration is absent', async () => {
    await expect(
      storage({}).write(Buffer.from('{}'), 'report'),
    ).rejects.toMatchObject({ status: 503 });
  });
  it('rejects overlapping audio and artwork roots', async () => {
    await expect(
      storage({
        ARTWORK_STORAGE_DIR: directory,
        AUDIO_STORAGE_DIR: directory,
      }).write(Buffer.from('{}'), 'report'),
    ).rejects.toThrow('separate');
    expect(await readdir(directory)).toEqual([]);
  });
  it('rejects traversal and malformed content without creating artifacts', async () => {
    const files = storage({ ARTWORK_STORAGE_DIR: directory });
    await expect(files.read('../private.json')).rejects.toThrow('reference');
    await expect(
      files.write(Buffer.from('not JSON'), 'report'),
    ).rejects.toThrow('JSON');
    await expect(files.write(Buffer.from('not PNG'), 'image')).rejects.toThrow(
      'PNG',
    );
    expect(await readdir(directory)).toEqual([]);
  });
  it('writes a report and removes only the explicitly discarded artifact', async () => {
    const files = storage({ ARTWORK_STORAGE_DIR: directory });
    const a = await files.write(Buffer.from('{"ok":true}'), 'report');
    const b = await files.write(Buffer.from('{}'), 'report');
    await files.discard(a.storageKey);
    expect(await readdir(directory)).toEqual([b.storageKey]);
  });
});
