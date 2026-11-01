// Real PostgreSQL and JWT checks; all records/files live in isolated test storage.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFileSync, readdirSync } = require('node:fs');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { Pool } = require('pg');
require('dotenv').config({ quiet: true });

async function main() {
  assert.ok(process.env.DATABASE_URL, 'DATABASE_URL is required');
  const databaseName = `sounds_upload_access_test_${randomUUID().replaceAll('-', '')}`;
  const admin = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
  const testUrl = new URL(process.env.DATABASE_URL);
  testUrl.pathname = `/${databaseName}`;
  let created = false, db, app, directory;
  try {
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    created = true;
    db = new Pool({ connectionString: testUrl.toString() });
    const migrations = path.resolve('prisma/migrations');
    const target = '20261101220000_artist_only_track_creation';
    for (const entry of readdirSync(migrations, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && entry.name < target)
      .sort((a, b) => a.name.localeCompare(b.name))) {
      await db.query(readFileSync(path.join(migrations, entry.name, 'migration.sql'), 'utf8'));
    }
    const seed = readFileSync('prisma/seed-rbac.sql', 'utf8');
    await db.query(seed);
    // Simulate the legacy assignment in an already-seeded installation.
    const legacyGrant = `INSERT INTO "RolePermission" ("roleId", "permissionId")
      SELECT r.id, p.id FROM "Role" r, "Permission" p
      WHERE r.key = 'ADMIN' AND p.key = 'tracks:create' ON CONFLICT DO NOTHING`;
    await db.query(legacyGrant);
    const grants = async () => (await db.query(`SELECT r.key AS role, p.key AS permission
      FROM "RolePermission" rp JOIN "Role" r ON r.id = rp."roleId"
      JOIN "Permission" p ON p.id = rp."permissionId" ORDER BY r.key, p.key`)).rows;
    const before = await grants();
    const expected = before.filter(row => !(row.role === 'ADMIN' && row.permission === 'tracks:create'));
    await db.query(readFileSync(path.join(migrations, target, 'migration.sql'), 'utf8'));
    assert.deepEqual(await grants(), expected, 'migration removes exactly one grant');
    await db.query(legacyGrant);
    await db.query(seed);
    await db.query(seed);
    assert.deepEqual(await grants(), expected, 're-seeding revokes legacy grant and is idempotent');

    directory = await mkdtemp(path.join(tmpdir(), 'sounds-upload-access-'));
    process.env.DATABASE_URL = testUrl.toString();
    process.env.AUDIO_STORAGE_DIR = directory;
    process.env.AUDIO_MAX_FILE_BYTES = '32768';
    process.env.JWT_SECRET = randomUUID();
    const { NestFactory } = require('@nestjs/core');
    const { AppModule } = require('../dist/src/app.module.js');
    const { PrismaService } = require('../dist/src/prisma/prisma.service.js');
    const { SessionsService } = require('../dist/src/auth/sessions.service.js');
    app = await NestFactory.create(AppModule, { logger: false });
    await app.listen(0, '127.0.0.1');
    const origin = await app.getUrl();
    const prisma = app.get(PrismaService);
    const sessions = app.get(SessionsService);
    const get = (route, token) => fetch(`${origin}${route}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    assert.equal((await get('/tracks/upload-config')).status, 401);
    assert.equal((await get('/auth/me')).status, 401);
    for (const [keys, allowed] of [[['USER'], false], [['ARTIST'], true], [['ADMIN'], false], [['ADMIN', 'ARTIST'], true]]) {
      const name = keys.join('-');
      const user = await prisma.user.create({ data: {
        username: name, email: `${name}@example.test`, password: 'unused',
        roles: { create: keys.map(key => ({ role: { connect: { key } } })) },
      } });
      const session = await sessions.create(user.id, prisma);
      const response = await get('/auth/me', session.accessToken);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
      const profile = await response.json();
      assert.equal(profile.permissions.includes('tracks:create'), allowed);
      assert.equal(new Set(profile.permissions).size, profile.permissions.length);
      assert.equal('password' in profile, false);
      assert.equal('accessToken' in profile, false);
      assert.ok(profile.roles.every(role => !('permissions' in role)));
      const configResponse = await get('/tracks/upload-config', session.accessToken);
      assert.equal(configResponse.status, allowed ? 200 : 403);
      if (allowed) {
        assert.equal(configResponse.headers.get('cache-control'), 'private, no-store');
        assert.deepEqual(await configResponse.json(), { maxFileBytes: 32768, formats: [
          { extension: '.mp3', mimeType: 'audio/mpeg' }, { extension: '.wav', mimeType: 'audio/wav' },
        ] });
      }
      if (name === 'ARTIST') {
        // Keep the same JWT while changing permissions and then role assignments.
        const artist = await prisma.role.findUniqueOrThrow({ where: { key: 'ARTIST' } });
        const create = await prisma.permission.findUniqueOrThrow({ where: { key: 'tracks:create' } });
        await prisma.rolePermission.delete({ where: { roleId_permissionId: { roleId: artist.id, permissionId: create.id } } });
        assert.equal((await (await get('/auth/me', session.accessToken)).json()).permissions.includes('tracks:create'), false);
        assert.equal((await get('/tracks/upload-config', session.accessToken)).status, 403);
        await prisma.rolePermission.create({ data: { roleId: artist.id, permissionId: create.id } });
        assert.equal((await (await get('/auth/me', session.accessToken)).json()).permissions.includes('tracks:create'), true);
        assert.equal((await get('/tracks/upload-config', session.accessToken)).status, 200);
        await prisma.userRole.deleteMany({ where: { userId: user.id } });
        assert.deepEqual((await (await get('/auth/me', session.accessToken)).json()).permissions, []);
        assert.equal((await get('/tracks/upload-config', session.accessToken)).status, 403);
      }
    }
    console.log('Upload access: migration/seed, USER/ARTIST/ADMIN/mixed roles, live grants/revocation, same JWT, safe profile, configured limit and auth passed.');
  } finally {
    if (app) await app.close();
    if (directory) {
      const resolved = path.resolve(directory);
      assert.equal(path.dirname(resolved), path.resolve(tmpdir()));
      assert.ok(path.basename(resolved).startsWith('sounds-upload-access-'));
      await rm(resolved, { recursive: true, force: true });
    }
    if (db) await db.end();
    if (created) {
      assert.match(databaseName, /^sounds_upload_access_test_[a-f0-9]{32}$/);
      await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
    }
    await admin.end();
  }
}

main().catch(error => {
  console.error('Upload access integration failed:', error.code ?? error.name);
  process.exitCode = 1;
});
