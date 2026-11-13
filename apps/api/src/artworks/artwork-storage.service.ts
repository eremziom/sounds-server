import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath, unlink } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { assertPrivateDirectory } from '../audio/audio-config';
import { invalidArtwork } from './artwork-snapshot';

export const ARTIFACT_MAX_BYTES = 32 * 1024 * 1024;

@Injectable()
export class ArtworkStorageService {
  constructor(private readonly config: ConfigService) {}

  // Lazy initialization: existing API deployments need no new setting until creator use.
  private async directory() {
    const configured = this.config.get<string>('ARTWORK_STORAGE_DIR');
    if (!configured || !isAbsolute(configured))
      throw new ServiceUnavailableException({
        code: 'ARTWORK_STORAGE_UNCONFIGURED',
        message: 'Configure an absolute ARTWORK_STORAGE_DIR',
      });
    const directory = resolve(configured);
    assertPrivateDirectory(directory);
    const audio = this.config.get<string>('AUDIO_STORAGE_DIR');
    const overlaps = (a: string, b: string) => {
      const p = relative(a, b);
      return p === '' || (!p.startsWith('..') && !isAbsolute(p));
    };
    if (
      audio &&
      (overlaps(resolve(audio), directory) ||
        overlaps(directory, resolve(audio)))
    )
      throw new Error('Artwork and audio storage must be separate');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    if ((await lstat(directory)).isSymbolicLink())
      throw new Error('Artwork storage must not be a symlink');
    const actual = await realpath(directory);
    assertPrivateDirectory(actual);
    if (actual.toLowerCase() !== directory.toLowerCase())
      throw new Error('Artwork storage ancestors must not be symlinks');
    return directory;
  }

  async write(bytes: Buffer, kind: string) {
    if (!bytes.length || bytes.length > ARTIFACT_MAX_BYTES)
      throw invalidArtwork('Artifact size outside supported limit');
    let width: number | null = null,
      height: number | null = null;
    const report = kind === 'report';
    if (report) {
      try {
        JSON.parse(bytes.toString('utf8'));
      } catch {
        throw invalidArtwork('Report must be JSON');
      }
    } else {
      if (
        bytes.length < 33 ||
        !bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
        bytes.toString('ascii', 12, 16) !== 'IHDR'
      )
        throw invalidArtwork('Image artifacts must be PNG');
      width = bytes.readUInt32BE(16);
      height = bytes.readUInt32BE(20);
      if (
        !width ||
        !height ||
        width > 16384 ||
        height > 16384 ||
        width * height > 67108864
      )
        throw invalidArtwork('Unsupported image dimensions');
    }
    const storageKey = `${randomUUID()}.${report ? 'json' : 'png'}`;
    const path = join(await this.directory(), storageKey);
    const handle = await open(path, 'wx', 0o600);
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } catch (error) {
      await handle.close();
      await unlink(path);
      throw error;
    }
    await handle.close();
    return {
      storageKey,
      mimeType: report ? 'application/json' : 'image/png',
      width,
      height,
      sizeBytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
  }

  private async path(key: string) {
    if (!/^[a-f0-9-]{36}\.(png|json)$/.test(key))
      throw invalidArtwork('Invalid storage reference');
    return join(await this.directory(), key);
  }

  async read(key: string) {
    const path = await this.path(key);
    if ((await lstat(path)).isSymbolicLink())
      throw invalidArtwork('Invalid artifact file');
    const handle = await open(
      path,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
    try {
      if (!(await handle.stat()).isFile())
        throw invalidArtwork('Invalid artifact file');
      return handle.createReadStream();
    } catch (error) {
      await handle.close();
      throw error;
    }
  }

  async discard(key: string) {
    await unlink(await this.path(key));
  }
}
