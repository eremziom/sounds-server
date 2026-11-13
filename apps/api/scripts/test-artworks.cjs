/* KRE-01 integration: only a generated disposable database and private fixture files. */
require('reflect-metadata');
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readdir, readFile, mkdtemp, rm } = require('node:fs/promises');
const path = require('node:path');
const { Pool } = require('pg');
const { Test } = require('@nestjs/testing');
const { ConfigService } = require('@nestjs/config');
const request = require('supertest');
const { PrismaService } = require('../dist/src/prisma/prisma.service.js');
const { ArtworksService } = require('../dist/src/artworks/artworks.service.js');
const {
  ArtworkStorageService,
} = require('../dist/src/artworks/artwork-storage.service.js');
const {
  ArtworksController,
} = require('../dist/src/artworks/artworks.controller.js');
const { JwtAuthGuard } = require('../dist/src/auth/jwt-auth.guard.js');
const {
  createApiValidationPipe,
} = require('../dist/src/common/api-validation.pipe.js');

async function main() {
  const name = `sounds_artwork_test_${randomUUID().replaceAll('-', '')}`;
  const originalUrl = process.env.DATABASE_URL;
  if (!originalUrl) throw new Error('DATABASE_URL required');
  const admin = new Pool({
    connectionString: originalUrl,
    connectionTimeoutMillis: 5000,
  });
  const url = new URL(originalUrl);
  url.pathname = `/${name}`;
  let created = false,
    db,
    prisma,
    app,
    directory;
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    created = true;
    db = new Pool({ connectionString: url.toString() });
    const migrations = path.resolve('prisma/migrations');
    const entries = (await readdir(migrations, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries.filter(
      (e) => e.name < '20261113000000_artwork_projects',
    ))
      await db.query(
        await readFile(
          path.join(migrations, entry.name, 'migration.sql'),
          'utf8',
        ),
      );
    await db.query(
      `INSERT INTO "Track" (title, "updatedAt") VALUES ('preserved-before-KRE01', CURRENT_TIMESTAMP)`,
    );
    const tracksBefore = (await db.query('SELECT * FROM "Track" ORDER BY id'))
      .rows;
    for (const entry of entries.filter(
      (e) => e.name >= '20261113000000_artwork_projects',
    ))
      await db.query(
        await readFile(
          path.join(migrations, entry.name, 'migration.sql'),
          'utf8',
        ),
      );
    assert.deepEqual(
      (await db.query('SELECT * FROM "Track" ORDER BY id')).rows,
      tracksBefore,
    );
    process.env.DATABASE_URL = url.toString();
    directory = await mkdtemp(path.resolve('../../.tmp/kre01-'));
    const config = new ConfigService({
      ARTWORK_STORAGE_DIR: directory,
      AUDIO_STORAGE_DIR: path.resolve('../../storage/audio'),
    });
    prisma = new PrismaService();
    await prisma.$connect();
    const owner = await prisma.user.create({
      data: {
        username: 'creator-owner',
        email: 'owner@example.test',
        password: 'unused',
      },
    });
    const outsider = await prisma.user.create({
      data: {
        username: 'creator-outsider',
        email: 'outsider@example.test',
        password: 'unused',
      },
    });
    const buildApp = async () => {
      const module = await Test.createTestingModule({
        controllers: [ArtworksController],
        providers: [
          ArtworksService,
          ArtworkStorageService,
          { provide: PrismaService, useValue: prisma },
          { provide: ConfigService, useValue: config },
        ],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue({
          canActivate(context) {
            const req = context.switchToHttp().getRequest();
            const id = Number(req.headers['x-fixture-user']);
            if (![owner.id, outsider.id].includes(id)) {
              const { UnauthorizedException } = require('@nestjs/common');
              throw new UnauthorizedException();
            }
            req.user = { userId: id };
            return true;
          },
        })
        .compile();
      const server = module.createNestApplication();
      server.useGlobalPipes(createApiValidationPipe());
      await server.init();
      return server;
    };
    app = await buildApp();
    let http = request(app.getHttpServer());
    const base = '/artworks/projects';
    const get = (uri, user = owner.id) =>
      http.get(uri).set('x-fixture-user', String(user));
    const post = (uri, body, user = owner.id) =>
      http.post(uri).set('x-fixture-user', String(user)).send(body);
    await http.get(base).expect(401);
    await post(base, { title: 'Scene', ownerId: outsider.id }).expect(400);
    const project = (await post(base, { title: 'Scene' }).expect(201)).body;
    const p = `${base}/${project.id}`;
    assert.equal(project.ownerId, owner.id);
    await get(p, outsider.id).expect(404);
    assert.deepEqual((await get(base, outsider.id).expect(200)).body, []);
    await post(`${p}/revisions`, {}).expect(400);
    const registrationId = randomUUID();
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
      'base64',
    );
    const upload = (meta, bytes = png, user = owner.id) =>
      http
        .post(`${p}/artifacts`)
        .set('x-fixture-user', String(user))
        .field('metadata', JSON.stringify(meta))
        .attach('file', bytes, 'fixture.png');
    const imageMeta = {
      kind: 'image',
      inputIds: [],
      registrationId,
      provenance: { tool: 'fixture', seed: 1, version: '1' },
    };
    await upload(imageMeta, png, outsider.id).expect((r) => {
      if (r.status !== 404)
        throw new Error(
          `Foreign upload ${r.status}: ${JSON.stringify(r.body)}`,
        );
    });
    await upload(imageMeta, Buffer.from('not png')).expect(400);
    const image = (await upload(imageMeta).expect(201)).body;
    assert.equal(image.width, 1);
    assert.equal(image.sizeBytes, png.length);
    assert.match(image.sha256, /^[a-f0-9]{64}$/);
    assert.equal(image.storageKey, undefined);
    const mask = (
      await upload({
        ...imageMeta,
        kind: 'material-mask',
        inputIds: [image.id],
      }).expect(201)
    ).body;
    await upload({
      ...imageMeta,
      kind: 'delay-map',
      inputIds: [randomUUID()],
    }).expect(400);
    await upload({
      ...imageMeta,
      kind: 'material-mask',
      registrationId: randomUUID(),
      inputIds: [image.id],
    }).expect(400);
    await upload({ ...imageMeta, width: 99 }).expect(400);
    const artifacts = (await get(`${p}/artifacts`).expect(200)).body;
    assert.equal(artifacts.length, 2);
    assert.equal(
      (await readdir(directory)).length,
      2,
      'failed validation removes only newly written files',
    );
    const bytes = await get(`${p}/artifacts/${image.id}/file`).expect(200);
    assert.deepEqual(bytes.body, png);
    await get(`${p}/artifacts/${image.id}/file`, outsider.id).expect(404);
    const snapshot = {
      schemaVersion: 1,
      brief: {
        intent: 'fixture only',
        guidelinesVersion: '1.7',
        guidelinesPath:
          'apps/ui/src/engines/infinite-zoom/artwork-authoring-guidelines.md',
        composition: 'contract fixture',
        motionPlan: 'not an artwork',
        lightingPlan: 'not an artwork',
        blackoutPlan: 'not an artwork',
        qaPlan: 'API test only',
      },
      layers: [
        {
          id: 'layer',
          imageArtifactId: image.id,
          maskArtifactIds: [mask.id],
          parameters: { requestedMotion: 'arc' },
        },
      ],
      artifactIds: [image.id, mask.id],
      decisions: [],
    };
    const revision = (await post(`${p}/revisions`, { snapshot }).expect(201))
      .body;
    assert.equal(revision.validation.ready, true);
    const replacement = (await upload(imageMeta).expect(201)).body;
    await post(`${p}/revisions`, {
      baseRevisionId: revision.id,
      snapshot: {
        ...snapshot,
        layers: [{ ...snapshot.layers[0], imageArtifactId: replacement.id }],
        artifactIds: [replacement.id, mask.id],
      },
    }).expect(400);
    const stale = (
      await post(`${p}/revisions`, {
        baseRevisionId: revision.id,
        snapshot: {
          ...snapshot,
          layers: [],
          artifactIds: [replacement.id, mask.id],
        },
      }).expect(201)
    ).body;
    assert.deepEqual(stale.validation, {
      ready: false,
      staleArtifactIds: [mask.id],
    });
    const attempts = await Promise.all([
      post(`${p}/revisions`, { baseRevisionId: stale.id, snapshot }),
      post(`${p}/revisions`, { baseRevisionId: stale.id, snapshot }),
    ]);
    assert.deepEqual(attempts.map((r) => r.status).sort(), [201, 409]);
    const winner = attempts.find((r) => r.status === 201).body;
    assert.equal(
      (await get(`${p}/revisions`).expect(200)).body.length,
      3,
      'conflict transaction leaves no orphan revision',
    );
    const restored = (
      await post(`${p}/restore`, {
        baseRevisionId: winner.id,
        revisionId: revision.id,
      }).expect(201)
    ).body;
    assert.equal(restored.parentId, winner.id);
    assert.equal(restored.restoredFromId, revision.id);
    assert.deepEqual(restored.snapshot, snapshot);
    assert.equal(
      (await get(`${p}/revisions/${stale.id}`).expect(200)).body.validation
        .ready,
      false,
    );
    const foreignProject = (
      await post(base, { title: 'Foreign' }, outsider.id).expect(201)
    ).body;
    await post(
      `${base}/${foreignProject.id}/revisions`,
      { snapshot },
      outsider.id,
    ).expect(400);
    await assert.rejects(
      prisma.artworkProject.update({
        where: { id: foreignProject.id },
        data: { activeRevisionId: revision.id },
      }),
      (e) => e.code === 'P2003',
    );
    await post(`${p}/messages`, { text: 'Keep this conversation' }).expect(201);
    await post(`${p}/messages`, {
      text: 'Fake tool result',
      role: 'assistant',
    }).expect(400);
    await app.close();
    app = null;
    await prisma.$disconnect();
    prisma = new PrismaService();
    await prisma.$connect();
    app = await buildApp();
    http = request(app.getHttpServer());
    assert.equal((await get(p).expect(200)).body.activeRevisionId, restored.id);
    assert.equal(
      (await get(`${p}/messages`).expect(200)).body[0].text,
      'Keep this conversation',
    );
    assert.deepEqual(
      (await get(`${p}/artifacts/${image.id}/file`).expect(200)).body,
      png,
    );
    const historyPage = (await get(`${p}/revisions`).expect(200)).body;
    assert.equal(
      (await get(`${p}/revisions?cursor=${historyPage[0].id}`).expect(200)).body
        .length,
      historyPage.length - 1,
    );
    await get(`${p}/revisions?cursor=${randomUUID()}`).expect(404);
    await get(`${p}/revisions?cursor=bad`).expect(400);
    await prisma.creatorMessage.createMany({
      data: Array.from({ length: 102 }, (_, i) => ({
        projectId: project.id,
        role: 'user',
        text: `pagination-${i}`,
      })),
    });
    const firstMessages = (await get(`${p}/messages`).expect(200)).body;
    const secondMessages = (
      await get(`${p}/messages?cursor=${firstMessages.at(-1).id}`).expect(200)
    ).body;
    assert.equal(firstMessages.length, 100);
    assert.equal(secondMessages.length, 3);
    assert.equal(
      new Set([...firstMessages, ...secondMessages].map((m) => m.id)).size,
      103,
    );
    assert.deepEqual(
      (await db.query('SELECT * FROM "Track" ORDER BY id')).rows,
      tracksBefore,
    );
    console.log(
      'KRE-01 integration passed: additive migration/data preservation, HTTP validation/ownership, files/hashes/cleanup, exact image-mask binding, stale dependencies, concurrent CAS rollback, restore/history, restart persistence, pagination and database cross-project constraints.',
    );
  } finally {
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
    if (db) await db.end();
    if (created && /^sounds_artwork_test_[a-f0-9]{32}$/.test(name))
      await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.end();
    process.env.DATABASE_URL = originalUrl;
    if (
      directory &&
      path.dirname(directory) === path.resolve('../../.tmp') &&
      path.basename(directory).startsWith('kre01-')
    )
      await rm(directory, { recursive: true });
  }
}
main().catch((error) => {
  console.error(
    'KRE-01 integration failed:',
    error.code ?? error.name,
    String(error.stack).replace(
      /postgres(?:ql)?:\/\/\S+/g,
      '[redacted connection]',
    ),
  );
  process.exitCode = 1;
});
