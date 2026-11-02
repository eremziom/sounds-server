const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFileSync, readdirSync } = require('node:fs');
const { mkdtemp, rm, readdir } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { Pool } = require('pg');
require('dotenv').config({ quiet: true });

async function main() {
  assert.ok(process.env.DATABASE_URL);
  const databaseName = `sounds_temporary_upload_test_${randomUUID().replaceAll('-', '')}`;
  const admin = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = `/${databaseName}`;
  let created = false, db, directory, app;
  try {
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    created = true;
    db = new Pool({ connectionString: url.toString() });
    for (const entry of readdirSync('prisma/migrations', { withFileTypes: true }).filter(e => e.isDirectory()).sort((a,b) => a.name.localeCompare(b.name))) {
      await db.query(readFileSync(path.join('prisma/migrations', entry.name, 'migration.sql'), 'utf8'));
    }
    await db.query(readFileSync('prisma/seed-rbac.sql', 'utf8'));
    directory = await mkdtemp(path.join(tmpdir(), 'sounds-temporary-upload-'));
    Object.assign(process.env, { DATABASE_URL: url.toString(), AUDIO_STORAGE_DIR: directory, AUDIO_MAX_FILE_BYTES: '16384', JWT_SECRET: randomUUID() });
    const { NestFactory } = require('@nestjs/core');
    const { AppModule } = require('../dist/src/app.module.js');
    const { PrismaService } = require('../dist/src/prisma/prisma.service.js');
    const { SessionsService } = require('../dist/src/auth/sessions.service.js');
    const { TemporaryUploadsService } = require('../dist/src/tracks/temporary-uploads.service.js');
    const { createApiValidationPipe } = require('../dist/src/common/api-validation.pipe.js');
    const boot = async () => {
      app = await NestFactory.create(AppModule, { logger: false });
      app.useGlobalPipes(createApiValidationPipe());
      await app.listen(0, '127.0.0.1');
      return { origin: await app.getUrl(), prisma: app.get(PrismaService), uploads: app.get(TemporaryUploadsService) };
    };
    let { origin, prisma, uploads } = await boot();
    const users = [];
    for (const name of ['artist', 'other']) {
      const user = await prisma.user.create({ data: { username: name, email: `${name}@example.test`, password: 'unused', roles: { create: { role: { connect: { key: 'ARTIST' } } } } } });
      users.push({ id: user.id, token: (await app.get(SessionsService).create(user.id, prisma)).accessToken });
    }
    const [artist, other] = users;
    const metadata = { title: 'Temporary upload', publicationDate: '2026-11-01', description: 'Synthetic audio', bpm: { bpmFrom: 120, bpmTo: 130 } };
    const bytes = Buffer.alloc(48);
    bytes.write('RIFF'); bytes.writeUInt32LE(40, 4); bytes.write('WAVEfmt ', 8); bytes.writeUInt32LE(16, 16);
    bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(16000, 28);
    bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(4, 40);
    const send = (route, method, user = artist, body) => fetch(`${origin}/tracks${route}`, { method,
      headers: { ...(user ? { Authorization: `Bearer ${user.token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const receive = async (blob = bytes, user = artist, extra = false, filename = 'recording.wav') => {
      const form = new FormData(); form.append('file', new Blob([blob]), filename);
      if (extra) form.append('metadata', '{}');
      return fetch(`${origin}/tracks/uploads`, { method: 'POST', headers: user ? { Authorization: `Bearer ${user.token}` } : {}, body: form });
    };
    const upload = async () => {
      const response = await receive(); assert.equal(response.status, 201);
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
      const receipt = await response.json();
      assert.deepEqual(Object.keys(receipt).sort(), ['expiresAt', 'uploadId']);
      assert.ok(Math.abs(Date.parse(receipt.expiresAt) - Date.now() - 86400000) < 10000);
      return receipt.uploadId;
    };
    const complete = (id, user = artist, data = metadata) => send(`/uploads/${id}/complete`, 'POST', user, data);
    const cancel = (id, user = artist) => send(`/uploads/${id}`, 'DELETE', user);
    assert.equal((await receive(bytes, null)).status, 401);
    assert.equal((await receive(Buffer.alloc(20000))).status, 413);
    assert.equal((await receive(Buffer.alloc(0))).status, 400);
    assert.equal((await receive(bytes, artist, true)).status, 400);
    assert.deepEqual(await readdir(path.join(directory, 'tmp')), []);
    assert.deepEqual(await readdir(path.join(directory, 'files')), []);

    // Rejected content must leave neither metadata nor bytes, including a forged extension.
    const compressedWav = Buffer.from(bytes); compressedWav.writeUInt16LE(7, 20);
    const mp3 = readFileSync(path.resolve('src/audio/fixtures/tone.mp3'));
    for (const [input, filename, status] of [
      [Buffer.from('not audio'), 'forged.mp3', 415],
      [mp3.subarray(0, -10), 'broken.mp3', 400],
      [bytes.subarray(0, -1), 'broken.wav', 400],
      [compressedWav, 'unsupported.wav', 415],
    ]) {
      assert.equal((await receive(input, artist, false, filename)).status, status);
      assert.equal(await prisma.track.count(), 0);
      assert.equal(await prisma.audioUpload.count(), 0);
      assert.equal(await prisma.audioFile.count(), 0);
      assert.deepEqual(await readdir(path.join(directory, 'tmp')), []);
      assert.deepEqual(await readdir(path.join(directory, 'files')), []);
    }

    // Registration failure compensates the already validated/private disk file.
    await db.query(`CREATE FUNCTION fail_upload() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test'; END $$;
      CREATE TRIGGER fail_upload BEFORE INSERT ON "AudioUpload" FOR EACH ROW EXECUTE FUNCTION fail_upload()`);
    assert.equal((await receive()).status, 500);
    assert.deepEqual(await readdir(path.join(directory, 'tmp')), []);
    assert.deepEqual(await readdir(path.join(directory, 'files')), []);
    await db.query('DROP TRIGGER fail_upload ON "AudioUpload"; DROP FUNCTION fail_upload()');

    let id = await upload();
    assert.equal(await prisma.track.count(), 0);
    assert.equal((await complete(id, other)).status, 404);
    assert.equal((await cancel(id, other)).status, 404);
    assert.equal((await complete(id, artist, { ...metadata, title: '' })).status, 400);
    assert.equal((await prisma.audioUpload.findUniqueOrThrow({ where: { id } })).status, 'PENDING');
    // Full restart proves that upload ownership and file metadata are durable.
    await app.close(); ({ origin, prisma, uploads } = await boot());
    const results = await Promise.all([complete(id), complete(id)]);
    assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
    const track = await results.find(r => r.status === 201).json();
    assert.equal(track.ownerId, artist.id); assert.equal(track.hasAudio, true);
    assert.equal(await prisma.track.count(), 1);
    assert.equal((await cancel(id)).status, 409);
    assert.equal((await send(`/${track.id}/audio`, 'GET')).status, 200);
    assert.equal((await send(`/${track.id}/audio`, 'HEAD')).status, 200);

    // Acceptance path for both actual formats through HTTP, PostgreSQL and disk.
    for (const [format, input, mimeType] of [['mp3', mp3, 'audio/mpeg'], ['wav', bytes, 'audio/wav']]) {
      const response = await receive(input, artist, false, `acceptance.${format}`);
      assert.equal(response.status, 201);
      const receipt = await response.json();
      const data = { ...metadata, title: `Acceptance ${format.toUpperCase()}` };
      const saved = await complete(receipt.uploadId, artist, data);
      assert.equal(saved.status, 201);
      const createdTrack = await saved.json();
      const listResponse = await send('', 'GET'); assert.equal(listResponse.status, 200);
      const listed = (await listResponse.json()).find(item => item.id === createdTrack.id);
      assert.ok(listed); assert.equal(listed.hasAudio, true);
      assert.equal(listed.title, data.title); assert.equal(listed.description, data.description);
      assert.deepEqual(listed.bpm, data.bpm); assert.equal(listed.publicationDate, data.publicationDate);
      const stored = await prisma.audioFile.findUniqueOrThrow({ where: { trackId: createdTrack.id } });
      assert.equal(stored.mimeType, mimeType); assert.equal(stored.sizeBytes, input.length);
      const audioResponse = await send(`/${createdTrack.id}/audio`, 'GET');
      assert.equal(audioResponse.status, 200); assert.equal(audioResponse.headers.get('content-type'), mimeType);
      assert.deepEqual(Buffer.from(await audioResponse.arrayBuffer()), input);
    }

    // PostgreSQL failure after claiming the row rolls back both consumption and Track.
    id = await upload();
    await db.query(`CREATE FUNCTION fail_track() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test'; END $$;
      CREATE TRIGGER fail_track BEFORE INSERT ON "Track" FOR EACH ROW EXECUTE FUNCTION fail_track()`);
    assert.equal((await complete(id)).status, 500);
    assert.equal((await prisma.audioUpload.findUniqueOrThrow({ where: { id } })).status, 'PENDING');
    await db.query('DROP TRIGGER fail_track ON "Track"; DROP FUNCTION fail_track()');
    assert.equal((await complete(id)).status, 201);

    // Optional BPM survives validation, temporary completion, storage and listing.
    id = await upload();
    const { bpm: omittedBpm, ...withoutBpm } = metadata;
    assert.equal((await complete(id, artist, { ...withoutBpm, bpm: { bpmFrom: 120 } })).status, 400);
    const noBpmResponse = await complete(id, artist, withoutBpm);
    assert.equal(noBpmResponse.status, 201);
    const noBpmTrack = await noBpmResponse.json();
    assert.equal(noBpmTrack.bpm, null);
    const noBpmRecord = await prisma.track.findUniqueOrThrow({ where: { id: noBpmTrack.id } });
    assert.equal(noBpmRecord.bpmFrom, null); assert.equal(noBpmRecord.bpmTo, null);
    assert.equal((await (await send('', 'GET')).json()).find(track => track.id === noBpmTrack.id).bpm, null);

    id = await upload();
    for (const data of [{ genre: 'ab' }, { genre: 'x'.repeat(31) }, { subgenre: 'ab' }, { subgenre: 'x'.repeat(31) }, { genre: 123 }, { description: 'ab' }, { publicationDate: '2026-02-30' }]) {
      assert.equal((await complete(id, artist, { publicationDate: '2025-04-03', title: 'Optional metadata', ...data })).status, 400);
    }
    const optionalResponse = await complete(id, artist, { publicationDate: '2025-04-03', title: 'Optional metadata', genre: 'abc', subgenre: 'x'.repeat(30) });
    assert.equal(optionalResponse.status, 201);
    const optionalTrack = await optionalResponse.json();
    assert.equal(optionalTrack.description, null);
    assert.equal(optionalTrack.genre, 'abc'); assert.equal(optionalTrack.subgenre, 'x'.repeat(30));
    const optionalRecord = await prisma.track.findUniqueOrThrow({ where: { id: optionalTrack.id } });
    assert.equal(optionalRecord.publicationDate.toISOString(), '2025-04-03T00:00:00.000Z');
    assert.equal(optionalRecord.description, null);
    assert.equal(optionalRecord.genre, 'abc'); assert.equal(optionalRecord.subgenre, 'x'.repeat(30));
    assert.equal(optionalTrack.publicationDate, optionalRecord.publicationDate.toISOString().slice(0, 10));

    for (let i = 0; i < 8; i++) {
      id = await upload();
      const [a, b] = await Promise.all([complete(id), cancel(id)]);
      assert.ok((a.status === 201 && b.status === 409) || (a.status === 404 && b.status === 204));
      const record = await prisma.audioUpload.findUniqueOrThrow({ where: { id } });
      const exists = (await readdir(path.join(directory, 'files'))).includes(record.storageKey);
      assert.equal(exists, record.status === 'CONSUMED');
    }
    id = await upload();
    await prisma.audioUpload.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const [expired] = await Promise.all([complete(id), uploads.expire(id)]);
    assert.equal(expired.status, 410);
    const record = await prisma.audioUpload.findUniqueOrThrow({ where: { id } });
    assert.equal(record.status, 'EXPIRED');
    assert.ok(!(await readdir(path.join(directory, 'files'))).includes(record.storageKey));
    // Cleanup of a live or consumed upload must never unlink its file.
    id = await upload(); await uploads.expire(id);
    assert.equal((await complete(id)).status, 201); await uploads.expire(id);
    assert.ok((await readdir(path.join(directory, 'files'))).includes((await prisma.audioUpload.findUniqueOrThrow({ where: { id } })).storageKey));

    // Hold complete inside its Track INSERT until TTL passes. Expiry then waits
    // for the same row and must recheck CONSUMED before considering disk cleanup.
    id = await upload();
    const lock = await db.connect();
    try {
      await lock.query('SELECT pg_advisory_lock(5392)');
      await db.query(`CREATE FUNCTION pause_track() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(5392); RETURN NEW; END $$;
        CREATE TRIGGER pause_track BEFORE INSERT ON "Track" FOR EACH ROW EXECUTE FUNCTION pause_track()`);
      const expiresAt = new Date(Date.now() + 3000);
      await prisma.audioUpload.update({ where: { id }, data: { expiresAt } });
      const completing = complete(id);
      let waiting = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        if ((await db.query("SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND objid = 5392 AND NOT granted")).rowCount) { waiting = true; break; }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      assert.equal(waiting, true, 'complete reached Track insertion while holding upload claim');
      await new Promise(resolve => setTimeout(resolve, Math.max(0, expiresAt.getTime() - Date.now() + 20)));
      const expiring = uploads.expire(id);
      await lock.query('SELECT pg_advisory_unlock(5392)');
      assert.equal((await completing).status, 201);
      await expiring;
      const consumed = await prisma.audioUpload.findUniqueOrThrow({ where: { id } });
      assert.equal(consumed.status, 'CONSUMED');
      assert.ok((await readdir(path.join(directory, 'files'))).includes(consumed.storageKey));
    } finally {
      await lock.query('SELECT pg_advisory_unlock_all()'); lock.release();
      await db.query('DROP TRIGGER pause_track ON "Track"; DROP FUNCTION pause_track()');
    }
    id = await upload();
    await prisma.userRole.deleteMany({ where: { userId: artist.id } });
    assert.equal((await complete(id)).status, 403);
    assert.equal((await receive()).status, 403);
    assert.equal((await cancel(id)).status, 204);
    assert.equal((await cancel(id)).status, 204);
    assert.equal((await cancel(id, null)).status, 401);
    console.log('Temporary uploads: real HTTP/PostgreSQL/storage, restart, ownership, validation, TTL, rollback, complete/complete, complete/cancel, expiry races and permission revocation passed.');
  } finally {
    if (app) await app.close();
    if (directory) {
      const resolved = path.resolve(directory);
      assert.equal(path.dirname(resolved), path.resolve(tmpdir()));
      assert.ok(path.basename(resolved).startsWith('sounds-temporary-upload-'));
      await rm(resolved, { recursive: true, force: true });
    }
    if (db) await db.end();
    if (created) {
      assert.match(databaseName, /^sounds_temporary_upload_test_[a-f0-9]{32}$/);
      await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
    }
    await admin.end();
  }
}
main().catch(error => { console.error('Temporary upload integration failed:', error.stack?.replaceAll(process.env.DATABASE_URL, '[database]')); process.exitCode = 1; });
