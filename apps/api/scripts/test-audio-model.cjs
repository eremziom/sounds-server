/* Migration checks use a fresh temporary database, never application records. */
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFileSync, readdirSync } = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
require('dotenv').config({ quiet: true });

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const databaseName = `sounds_audio_test_${randomUUID().replaceAll('-', '')}`;
  const admin = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
  });
  const testUrl = new URL(process.env.DATABASE_URL);
  testUrl.pathname = `/${databaseName}`;
  let created = false;
  let db;
  let prisma;
  try {
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    created = true;
    db = new Pool({ connectionString: testUrl.toString() });
    const migrationName = '20261101000000_add_track_owner_and_audio_file';
    const migrationsDir = path.resolve('prisma/migrations');
    for (const entry of readdirSync(migrationsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name < migrationName)
      .sort((a, b) => a.name.localeCompare(b.name))) {
      await db.query(
        readFileSync(
          path.join(migrationsDir, entry.name, 'migration.sql'),
          'utf8',
        ),
      );
    }
    const historical = await db.query(`
      INSERT INTO "Track" (title, description, "releaseDate", "bpmFrom", "bpmTo", "updatedAt")
      VALUES ('Historical track', 'Preserve me', '2024-01-01', 128, 132, CURRENT_TIMESTAMP)
      RETURNING *
    `);
    await db.query(
      readFileSync(
        path.join(migrationsDir, migrationName, 'migration.sql'),
        'utf8',
      ),
    );
    const migrated = await db.query('SELECT * FROM "Track"');
    assert.deepEqual(migrated.rows, [{ ...historical.rows[0], ownerId: null }]);

    process.env.DATABASE_URL = testUrl.toString();
    const { PrismaService } = require('../dist/src/prisma/prisma.service.js');
    const { TracksService } = require('../dist/src/tracks/tracks.service.js');
    prisma = new PrismaService();
    await prisma.$connect();
    // Model-only fixture: storage keys here are synthetic, never actual app files.
    const removedKeys = [];
    const tracks = new TracksService(prisma, { remove: async (key) => { removedKeys.push(key); } });
    const adminActor = { userId: 1, permissions: ['tracks:delete-any'] };
    assert.equal((await tracks.findOne(historical.rows[0].id)).hasAudio, false);
    const owner = await prisma.user.create({
      data: {
        username: 'audio-tester',
        email: 'audio@example.test',
        password: 'unused',
      },
    });
    const dto = {
      title: 'Owned track',
      releaseDate: '2026-01-01',
      description: null,
      bpm: { bpmFrom: 130, bpmTo: 135 },
    };
    const track = await tracks.create({ ...dto, ownerId: 999 }, owner.id);
    assert.equal(track.ownerId, owner.id);
    assert.equal(track.hasAudio, false);
    const audioData = {
      trackId: track.id,
      storageKey: `${randomUUID()}.mp3`,
      originalName: 'example.mp3',
      mimeType: 'audio/mpeg',
      sizeBytes: 1024,
    };
    await prisma.audioFile.create({ data: audioData });
    assert.equal((await tracks.findOne(track.id)).hasAudio, true);
    assert.equal(
      (await tracks.findAll()).find((item) => item.id === track.id).hasAudio,
      true,
    );
    const response = await tracks.update(track.id, { title: 'Updated track' });
    assert.equal(response.hasAudio, true);
    assert.equal(response.ownerId, owner.id);
    for (const field of [
      'audioFile',
      'storageKey',
      'originalName',
      'mimeType',
      'sizeBytes',
    ]) {
      assert.equal(Object.hasOwn(response, field), false);
    }
    const uniqueViolation = (error) => error.code === 'P2002';
    await assert.rejects(
      prisma.audioFile.create({
        data: { ...audioData, storageKey: 'other.mp3' },
      }),
      uniqueViolation,
    );
    await assert.rejects(
      prisma.audioFile.create({
        data: { ...audioData, trackId: historical.rows[0].id },
      }),
      uniqueViolation,
    );
    await assert.rejects(
      prisma.audioFile.create({
        data: { ...audioData, trackId: 2147483647, storageKey: 'missing.mp3' },
      }),
      (error) => error.code === 'P2003',
    );
    // The upload service uses this nested write: both records commit or neither does.
    const uploadAudio = {
      storageKey: `${randomUUID()}.wav`,
      originalName: 'upload.wav',
      mimeType: 'audio/wav',
      sizeBytes: 48,
    };
    const uploaded = await tracks.createWithAudio(dto, owner.id, uploadAudio);
    assert.equal(uploaded.ownerId, owner.id);
    assert.equal(uploaded.hasAudio, true);
    const beforeFailure = await prisma.track.count();
    await assert.rejects(
      tracks.createWithAudio(dto, owner.id, uploadAudio),
      uniqueViolation,
    );
    assert.equal(await prisma.track.count(), beforeFailure);
    await assert.rejects(
      tracks.createWithAudio(dto, 2147483647, {
        ...uploadAudio, storageKey: `${randomUUID()}.wav`,
      }),
      (error) => error.code === 'P2003',
    );
    assert.equal(await prisma.track.count(), beforeFailure);
    await db.query(`
      CREATE FUNCTION reject_test_track_delete() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'simulated delete failure'; END $$;
      CREATE TRIGGER reject_test_track_delete BEFORE DELETE ON "Track"
      FOR EACH ROW EXECUTE FUNCTION reject_test_track_delete();
    `);
    await assert.rejects(tracks.remove(uploaded.id, adminActor));
    assert.equal((await tracks.findOne(uploaded.id)).hasAudio, true);
    assert.equal(removedKeys.includes(uploadAudio.storageKey), false);
    await db.query('DROP TRIGGER reject_test_track_delete ON "Track"; DROP FUNCTION reject_test_track_delete();');
    await tracks.remove(uploaded.id, { userId: owner.id, permissions: ['tracks:delete-own'] });
    assert.ok(removedKeys.includes(uploadAudio.storageKey));

    // Deleting an account must preserve its tracks and associated audio.
    await prisma.user.delete({ where: { id: owner.id } });
    assert.equal((await tracks.findOne(track.id)).ownerId, null);
    assert.equal((await tracks.findOne(track.id)).hasAudio, true);
    await assert.rejects(
      tracks.remove(track.id, { userId: owner.id, permissions: ['tracks:delete-own'] }),
      (error) => error.getStatus() === 403,
    );
    await tracks.remove(track.id, adminActor);
    assert.ok(removedKeys.includes(audioData.storageKey));
    assert.equal(await prisma.audioFile.count(), 0);
    assert.deepEqual(
      await db.query('SELECT * FROM "Track"').then((result) => result.rows),
      migrated.rows,
    );
    console.log(
      'Audio model: historical data, ownership, responses, atomic creation, deletion rollback/permissions/cleanup ordering, uniqueness, foreign keys and cascading metadata deletion passed.',
    );
  } finally {
    if (prisma) await prisma.$disconnect();
    if (db) await db.end();
    if (created) {
      if (!/^sounds_audio_test_[a-f0-9]{32}$/.test(databaseName))
        throw new Error('Unexpected test database name');
      await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
    }
    await admin.end();
  }
}

main().catch((error) => {
  // Avoid exposing connection details on setup failures.
  console.error(
    'Audio model integration test failed:',
    error.code ?? error.name,
  );
  process.exitCode = 1;
});
