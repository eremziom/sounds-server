import { lstat, opendir, realpath, unlink } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import type { PrismaService } from '../prisma/prisma.service';
import { assertPrivateDirectory } from './audio-config';

const uuid =
  '[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}';
const patterns = {
  tmp: new RegExp(`^${uuid}\\.tmp$`),
  files: new RegExp(`^${uuid}\\.(mp3|wav)$`),
};
export type CleanupEvent = {
  action: 'expire' | 'remove' | 'skip' | 'error';
  key: string;
  scope: 'upload' | 'tmp' | 'files';
  reason?: string;
  applied?: boolean;
};

// No startup probes, directory creation, validation workers or HTTP server.
// Preview must be read-only, including upload state transitions.
export async function cleanupAudio(
  prisma: PrismaService,
  directory: string,
  options: {
    delete?: boolean;
    graceHours?: number;
    now?: Date;
    report: (event: CleanupEvent) => void;
  },
) {
  const graceHours = options.graceHours ?? 24;
  if (!Number.isSafeInteger(graceHours) || graceHours < 24)
    throw new Error('Grace period must be an integer of at least 24 hours');
  if (!isAbsolute(directory))
    throw new Error('Storage directory must be absolute');
  assertPrivateDirectory(directory);
  const now = options.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new Error('Invalid cleanup time');
  const cutoff = now.getTime() - graceHours * 3600000;
  const summary = {
    mode: options.delete ? 'delete' : 'preview',
    expired: 0,
    removed: 0,
    skipped: 0,
    errors: 0,
  };
  const report = (event: CleanupEvent) => {
    if (event.action === 'expire') summary.expired++;
    if (event.action === 'remove') summary.removed++;
    if (event.action === 'skip') summary.skipped++;
    if (event.action === 'error') summary.errors++;
    options.report(event);
  };
  async function checkDirectories() {
    for (const path of [
      directory,
      join(directory, 'tmp'),
      join(directory, 'files'),
    ]) {
      const info = await lstat(path);
      if (!info.isDirectory() || info.isSymbolicLink())
        throw new Error('Storage directories must be regular directories');
      assertPrivateDirectory(await realpath(path));
    }
  }
  await checkDirectories();
  // Keyset pagination avoids loading the whole upload table into memory.
  let cursor: string | undefined;
  while (true) {
    const batch = await prisma.audioUpload.findMany({
      where: {
        status: 'PENDING',
        expiresAt: { lte: now },
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      orderBy: { id: 'asc' },
      take: 100,
    });
    if (!batch.length) break;
    for (const upload of batch) {
      try {
        // Same conditional transition as TemporaryUploadsService.expire. The row
        // lock and predicate recheck serialize expiry against complete/cancel.
        const changed =
          !options.delete ||
          (
            await prisma.audioUpload.updateMany({
              where: {
                id: upload.id,
                status: 'PENDING',
                expiresAt: { lte: now },
              },
              data: { status: 'EXPIRED' },
            })
          ).count > 0;
        report({
          scope: 'upload',
          key: upload.id,
          action: changed ? 'expire' : 'skip',
          applied: !!options.delete && changed,
        });
      } catch {
        report({
          action: 'error',
          scope: 'upload',
          key: upload.id,
          reason: 'database',
        });
      }
    }
    cursor = batch[batch.length - 1].id;
  }
  for (const scope of ['tmp', 'files'] as const) {
    const entries = await opendir(join(directory, scope));
    for await (const entry of entries) {
      const key = entry.name;
      try {
        if (!patterns[scope].test(key)) {
          report({ action: 'skip', scope, key, reason: 'unknown-name' });
          continue;
        }
        const path = join(directory, scope, key);
        const info = await lstat(path);
        if (!info.isFile() || info.isSymbolicLink()) {
          report({ action: 'skip', scope, key, reason: 'not-regular-file' });
          continue;
        }
        // ctime/birthtime also protect a just-committed file with an old mtime.
        if (Math.max(info.mtimeMs, info.ctimeMs, info.birthtimeMs) > cutoff) {
          report({ action: 'skip', scope, key, reason: 'grace-period' });
          continue;
        }
        await prisma.$transaction(async (tx) => {
          if (scope === 'files') {
            const [audio, upload] = await Promise.all([
              tx.audioFile.findUnique({
                where: { storageKey: key },
                select: { id: true },
              }),
              tx.audioUpload.findUnique({
                where: { storageKey: key },
                select: { status: true, expiresAt: true },
              }),
            ]);
            // Never remove CONSUMED, even if metadata is inconsistent. Pending
            // expiry must be claimed above, not inferred from a stale SELECT.
            const protectedUpload =
              upload &&
              (upload.status === 'CONSUMED' ||
                (upload.status === 'PENDING' &&
                  (options.delete || upload.expiresAt > now)));
            if (audio || protectedUpload) {
              report({ action: 'skip', scope, key, reason: 'referenced' });
              return;
            }
          }
          if (options.delete) {
            await checkDirectories();
            const current = await lstat(path);
            if (
              !current.isFile() ||
              current.isSymbolicLink() ||
              current.ino !== info.ino ||
              current.dev !== info.dev ||
              current.size !== info.size ||
              current.mtimeMs !== info.mtimeMs ||
              current.ctimeMs !== info.ctimeMs
            ) {
              report({ action: 'skip', scope, key, reason: 'changed' });
              return;
            }
            await unlink(path);
          }
          report({ action: 'remove', scope, key, applied: !!options.delete });
        });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT')
          report({ action: 'skip', scope, key, reason: 'already-absent' });
        else
          report({
            action: 'error',
            scope,
            key,
            reason: 'database-or-filesystem',
          });
      }
    }
  }
  return summary;
}
