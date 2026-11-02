const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFileSync, readdirSync } = require('node:fs');
const {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  rm,
  symlink,
  lstat,
} = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { Pool } = require('pg');
const { cleanupAudio } = require('../dist/src/audio/audio-cleanup.js');
const { PrismaService } = require('../dist/src/prisma/prisma.service.js');
require('dotenv').config({ quiet: true });

async function main() {
  assert.ok(process.env.DATABASE_URL);
  const databaseName = `sounds_cleanup_test_${randomUUID().replaceAll('-', '')}`;
  const admin = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
  });
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = `/${databaseName}`;
  let created = false,
    db,
    prisma,
    directory;
  try {
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    created = true;
    db = new Pool({ connectionString: url.toString() });
    for (const entry of readdirSync('prisma/migrations', {
      withFileTypes: true,
    })
      .filter((e) => e.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name))) {
      await db.query(
        readFileSync(
          path.join('prisma/migrations', entry.name, 'migration.sql'),
          'utf8',
        ),
      );
    }
    directory = await mkdtemp(path.join(tmpdir(), 'sounds-cleanup-'));
    await mkdir(path.join(directory, 'tmp'));
    await mkdir(path.join(directory, 'files'));
    process.env.DATABASE_URL = url.toString();
    prisma = new PrismaService();
    await prisma.$connect();
    const owner = await prisma.user.create({
      data: {
        username: 'cleanup',
        email: 'cleanup@example.test',
        password: 'unused',
      },
    });
    // Move only the sweeper's test clock. ctime/birthtime cannot be backdated
    // portably; production never accepts a clock override from the CLI.
    const now = new Date(Date.now() + 72 * 3600000);
    const future = new Date(now.getTime() + 3600000),
      past = new Date(now.getTime() - 3600000);
    async function file(
      scope = 'files',
      extension = scope === 'tmp' ? 'tmp' : 'wav',
    ) {
      const key = `${randomUUID()}.${extension}`;
      await writeFile(path.join(directory, scope, key), 'audio');
      return key;
    }
    async function upload(status, expiresAt = past, storageKey) {
      return prisma.audioUpload.create({
        data: {
          ownerId: owner.id,
          status,
          expiresAt,
          storageKey: storageKey ?? (await file()),
          originalName: 'recording.wav',
          mimeType: 'audio/wav',
          sizeBytes: 5,
        },
      });
    }
    const orphan = await file(),
      oldTmp = await file('tmp');
    const fresh = await file();
    const { utimes } = require('node:fs/promises');
    await utimes(path.join(directory, 'files', fresh), now, now);
    const pending = await upload('PENDING', future);
    const expired = await upload('PENDING');
    const cancelled = await upload('CANCELLED');
    const retired = await upload('EXPIRED');
    const consumed = await upload('CONSUMED'); // Conservatively protect even without AudioFile.
    const liveKey = await file();
    await prisma.track.create({
      data: {
        title: 'Keep',
        ownerId: owner.id,
        audioFile: {
          create: {
            storageKey: liveKey,
            originalName: 'keep.wav',
            mimeType: 'audio/wav',
            sizeBytes: 5,
          },
        },
      },
    });
    const missing = await upload('PENDING', past, `${randomUUID()}.wav`);
    const unknown = 'notes.txt';
    await writeFile(path.join(directory, 'files', unknown), 'keep');
    const nested = `${randomUUID()}.wav`;
    await mkdir(path.join(directory, 'files', nested));
    const snapshot = async () => ({
      files: (await readdir(path.join(directory, 'files'))).sort(),
      tmp: (await readdir(path.join(directory, 'tmp'))).sort(),
      uploads: await prisma.audioUpload.findMany({ orderBy: { id: 'asc' } }),
    });
    const before = await snapshot(),
      previewEvents = [];
    const preview = await cleanupAudio(prisma, directory, {
      now,
      report: (event) => previewEvents.push(event),
    });
    assert.deepEqual(
      await snapshot(),
      before,
      'preview never mutates files or rows',
    );
    assert.equal(preview.mode, 'preview');
    assert.equal(preview.errors, 0);
    assert.ok(
      previewEvents.some(
        (event) =>
          event.key === expired.storageKey &&
          event.action === 'remove' &&
          !event.applied,
      ),
    );
    assert.ok(
      previewEvents.some(
        (event) =>
          event.key === pending.storageKey && event.reason === 'referenced',
      ),
    );
    assert.ok(
      previewEvents.some(
        (event) => event.key === fresh && event.reason === 'grace-period',
      ),
    );
    const events = [];
    const result = await cleanupAudio(prisma, directory, {
      delete: true,
      now,
      report: (event) => events.push(event),
    });
    assert.equal(result.errors, 0);
    assert.equal(result.expired, 2);
    assert.equal(result.removed, 5);
    for (const key of [
      orphan,
      expired.storageKey,
      cancelled.storageKey,
      retired.storageKey,
    ]) {
      await assert.rejects(lstat(path.join(directory, 'files', key)), {
        code: 'ENOENT',
      });
    }
    await assert.rejects(lstat(path.join(directory, 'tmp', oldTmp)), {
      code: 'ENOENT',
    });
    for (const key of [
      pending.storageKey,
      consumed.storageKey,
      liveKey,
      fresh,
      unknown,
    ])
      assert.ok(await readFile(path.join(directory, 'files', key)));
    for (const id of [expired.id, missing.id])
      assert.equal(
        (await prisma.audioUpload.findUniqueOrThrow({ where: { id } })).status,
        'EXPIRED',
      );
    assert.equal(
      (
        await prisma.audioUpload.findUniqueOrThrow({
          where: { id: pending.id },
        })
      ).status,
      'PENDING',
    );
    assert.equal(
      (
        await cleanupAudio(prisma, directory, {
          delete: true,
          now,
          report() {},
        })
      ).removed,
      0,
      'idempotent rerun',
    );

    // Another process completes after the cleaner SELECT, before conditional expiry.
    // The UPDATE blocks on the row, then must recheck CONSUMED after commit.
    const racing = await upload('PENDING');
    const lock = await db.connect();
    try {
      await lock.query('BEGIN');
      await lock.query(
        'UPDATE "AudioUpload" SET status=\'CONSUMED\' WHERE id=$1',
        [racing.id],
      );
      const run = cleanupAudio(prisma, directory, {
        delete: true,
        now,
        report() {},
      });
      let waiting = false;
      for (let i = 0; i < 100; i++) {
        const rows = await db.query(
          "SELECT 1 FROM pg_stat_activity WHERE datname=$1 AND wait_event_type='Lock' AND query LIKE '%AudioUpload%'",
          [databaseName],
        );
        if (rows.rowCount) {
          waiting = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      await lock.query('COMMIT');
      const raceResult = await run;
      assert.equal(waiting, true, 'expiry waited for the complete row lock');
      assert.equal(raceResult.errors, 0);
      assert.ok(
        await readFile(path.join(directory, 'files', racing.storageKey)),
      );
    } finally {
      await lock.query('ROLLBACK');
      lock.release();
    }

    // A DB failure must never turn unknown references into orphan candidates.
    const failureOrphan = await file();
    const failingPrisma = {
      audioUpload: prisma.audioUpload,
      $transaction: async () => {
        throw Error('database unavailable');
      },
    };
    const failed = await cleanupAudio(failingPrisma, directory, {
      delete: true,
      now,
      report() {},
    });
    assert.ok(failed.errors > 0);
    assert.ok(await readFile(path.join(directory, 'files', failureOrphan)));
    await assert.rejects(
      cleanupAudio(prisma, directory, { graceHours: 0, report() {} }),
    );
    await assert.rejects(cleanupAudio(prisma, 'relative', { report() {} }));

    // Never follow a directory junction/symlink outside the configured store.
    const linked = path.join(directory, 'linked');
    await mkdir(linked);
    await symlink(
      path.join(directory, 'files'),
      path.join(linked, 'files'),
      'junction',
    );
    await mkdir(path.join(linked, 'tmp'));
    await assert.rejects(
      cleanupAudio(prisma, linked, { delete: true, now, report() {} }),
    );
    const cli = (args) =>
      spawnSync(process.execPath, ['scripts/cleanup-audio.cjs', ...args], {
        env: {
          ...process.env,
          DATABASE_URL: url.toString(),
          AUDIO_STORAGE_DIR: directory,
        },
        encoding: 'utf8',
        windowsHide: true,
      });
    const cliBefore = await snapshot();
    const cliPreview = cli([]);
    assert.equal(cliPreview.status, 0, cliPreview.stderr);
    assert.equal(
      JSON.parse(cliPreview.stdout.trim().split('\n').at(-1)).summary.mode,
      'preview',
    );
    assert.deepEqual(await snapshot(), cliBefore);
    assert.equal(cli(['--delete', '--grace-hours', '0']).status, 1);
    assert.equal(cli(['--typo']).status, 1);
    const cliDelete = cli(['--delete']);
    assert.equal(cliDelete.status, 0, cliDelete.stderr);
    assert.equal(
      JSON.parse(cliDelete.stdout.trim().split('\n').at(-1)).summary.mode,
      'delete',
    );
    console.log(
      'Audio cleanup: real PostgreSQL/filesystem, read-only preview, grace period, references, TTL, retired uploads, orphans, idempotence, complete race, DB failure, junction rejection and CLI passed.',
    );
  } finally {
    if (prisma) await prisma.$disconnect();
    if (directory) {
      const resolved = path.resolve(directory);
      assert.equal(path.dirname(resolved), path.resolve(tmpdir()));
      assert.ok(path.basename(resolved).startsWith('sounds-cleanup-'));
      await rm(resolved, { recursive: true, force: true });
    }
    if (db) await db.end();
    if (created) {
      assert.match(databaseName, /^sounds_cleanup_test_[a-f0-9]{32}$/);
      await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
    }
    await admin.end();
  }
}
main().catch(() => {
  console.error('Audio cleanup integration failed.');
  process.exitCode = 1;
});
