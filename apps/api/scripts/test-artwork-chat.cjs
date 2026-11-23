/* KRE-05 real HTTP/PostgreSQL persistence; controlled model and auth fixture, no inference/worker. */
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
const { AppModule } = require('../dist/src/app.module.js');
const {
  LocalCreatorModel,
} = require('../dist/src/artwork-chat/local-creator-model.js');
const { PrismaService } = require('../dist/src/prisma/prisma.service.js');
const { JwtAuthGuard } = require('../dist/src/auth/jwt-auth.guard.js');
const {
  createApiValidationPipe,
} = require('../dist/src/common/api-validation.pipe.js');
async function main() {
  const original = process.env.DATABASE_URL,
    admin = new Pool({ connectionString: original });
  const name = 'sounds_chat_test_' + randomUUID().replaceAll('-', ''),
    url = new URL(original);
  url.pathname = '/' + name;
  let app,
    sql,
    directory,
    created = false,
    modelCalls = 0,
    answer;
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    created = true;
    sql = new Pool({ connectionString: url.toString() });
    for (const entry of (
      await readdir('prisma/migrations', { withFileTypes: true })
    )
      .filter((e) => e.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name)))
      await sql.query(
        await readFile(
          path.join('prisma/migrations', entry.name, 'migration.sql'),
          'utf8',
        ),
      );
    process.env.DATABASE_URL = url.toString();
    directory = await mkdtemp(path.resolve('../../.tmp/kre05-'));
    const config = new ConfigService({
      ...process.env,
      ARTWORK_REPO_ROOT: path.resolve('../..'),
      ARTWORK_STORAGE_DIR: directory,
    });
    const fakeModel = {
      enabled: () => true,
      complete: async () => {
        modelCalls++;
        return answer;
      },
    };
    const build = async () => {
      const module = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(ConfigService)
        .useValue(config)
        .overrideProvider(LocalCreatorModel)
        .useValue(fakeModel)
        .overrideGuard(JwtAuthGuard)
        .useValue({
          canActivate(context) {
            const r = context.switchToHttp().getRequest(),
              owner = Number(r.headers['x-fixture-user']);
            if (!owner) {
              const { UnauthorizedException } = require('@nestjs/common');
              throw new UnauthorizedException();
            }
            r.user = { userId: owner };
            return true;
          },
        })
        .compile();
      const server = module.createNestApplication({ logger: false });
      server.useGlobalPipes(createApiValidationPipe());
      await server.init();
      return server;
    };
    app = await build();
    const db = app.get(PrismaService);
    const owner = await db.user.create({
      data: {
        username: 'chat-owner',
        email: 'chat-owner@example.test',
        password: 'unused',
      },
    });
    const foreign = await db.user.create({
      data: {
        username: 'chat-other',
        email: 'chat-other@example.test',
        password: 'unused',
      },
    });
    let http = request(app.getHttpServer());
    const post = (route, body, user = owner.id) =>
      http.post(route).set('x-fixture-user', String(user)).send(body);
    const get = (route, user = owner.id) =>
      http.get(route).set('x-fixture-user', String(user));
    const project = (
      await post('/artworks/projects', {
        title: 'KRE-05 no-model fixture',
      }).expect(201)
    ).body;
    const base = `/artworks/projects/${project.id}`;
    await http
      .post(base + '/chat')
      .send({})
      .expect(401);
    const png = await require('sharp')({
      create: { width: 64, height: 64, channels: 3, background: '#345678' },
    })
      .png()
      .toBuffer();
    const image = (
      await http
        .post(base + '/artifacts')
        .set('x-fixture-user', String(owner.id))
        .field(
          'metadata',
          JSON.stringify({
            kind: 'image',
            registrationId: randomUUID(),
            inputIds: [],
            provenance: { fixture: true },
          }),
        )
        .attach('file', png, 'source.png')
        .expect(201)
    ).body;
    const brief = JSON.parse(
      await readFile(
        'resources/artwork-starters/night-garden/definition.json',
        'utf8',
      ),
    ).snapshot.brief;
    const snapshot = {
      schemaVersion: 1,
      brief,
      layers: [
        {
          id: 'drone',
          imageArtifactId: image.id,
          maskArtifactIds: [],
          parameters: {},
        },
      ],
      artifactIds: [image.id],
      decisions: [],
    };
    const revision = (
      await post(base + '/revisions', {
        baseRevisionId: null,
        snapshot,
      }).expect(201)
    ).body;
    const turn = {
      requestId: randomUUID(),
      baseRevisionId: revision.id,
      text: 'Niech dron leci po łuku.',
      mode: 'plan',
      imageArtifactId: image.id,
      point: { x: 0, y: 0 },
    };
    answer = {
      content: 'Proponuję zmianę trasy.',
      tool_calls: [
        {
          function: {
            name: 'setTravel',
            arguments: JSON.stringify({
              inputIds: [],
              arguments: { layerId: 'drone', travel: { durationSeconds: 24 } },
            }),
          },
        },
      ],
    };
    await post(base + '/chat', { ...turn, extra: 'forbidden' }).expect(400);
    await post(base + '/chat', turn, foreign.id).expect(404);
    const reply = (await post(base + '/chat', turn).expect(201)).body;
    assert.equal(reply.status, 'proposed');
    assert.deepEqual((await get(base + '/jobs').expect(200)).body, []);
    assert.deepEqual(
      (await post(base + '/chat', turn).expect(201)).body,
      reply,
    );
    assert.equal(modelCalls, 1);
    const execution = (
      await post(base + `/chat/${turn.requestId}/execute`, {}).expect(201)
    ).body;
    const jobId = execution.results[0].jobId;
    assert.ok(jobId);
    assert.equal(execution.results[0].state, 'queued');
    assert.deepEqual(
      (await post(base + `/chat/${turn.requestId}/execute`, {}).expect(201))
        .body,
      execution,
    );
    assert.equal((await get(base + '/jobs')).body.length, 1);
    await post(base + `/chat/${turn.requestId}/apply/${jobId}`, {}).expect(400);
    // A controlled successful report stands in for the worker; no real image/model job runs.
    const candidate = structuredClone(snapshot);
    candidate.layers[0].parameters.travel = { durationSeconds: 24 };
    const report = (
      await http
        .post(base + '/artifacts')
        .set('x-fixture-user', String(owner.id))
        .field(
          'metadata',
          JSON.stringify({
            kind: 'report',
            inputIds: [],
            provenance: { fixture: 'controlled worker report' },
          }),
        )
        .attach(
          'file',
          Buffer.from(JSON.stringify({ snapshotCandidate: candidate })),
          'report.json',
        )
        .expect(201)
    ).body;
    await db.artworkJob.update({
      where: { id: jobId },
      data: {
        state: 'succeeded',
        result: { outputs: [{ name: 'package', artifactId: report.id }] },
      },
    });
    const applied = (
      await post(base + `/chat/${turn.requestId}/apply/${jobId}`, {}).expect(
        201,
      )
    ).body;
    assert.equal(applied.parentId, revision.id);
    assert.equal(
      applied.snapshot.layers[0].parameters.travel.durationSeconds,
      24,
    );
    assert.equal(
      (
        await post(base + `/chat/${turn.requestId}/apply/${jobId}`, {}).expect(
          201,
        )
      ).body.id,
      applied.id,
    );
    await post(base + `/chat/${turn.requestId}/execute`, {}).expect(409);
    await app.close();
    app = await build();
    http = request(app.getHttpServer());
    const messages = (await get(base + '/messages').expect(200)).body;
    assert.equal(messages.filter((m) => m.role.startsWith('chat-')).length, 3);
    assert.equal(modelCalls, 1);
    await post(base + `/chat/${turn.requestId}/cancel`, {}).expect(201);
    assert.equal(
      (await post(base + '/chat', turn).expect(201)).body.status,
      'cancelled',
    );
    console.log(
      'KRE-05 HTTP/PostgreSQL OK: access, DTO, proposal, explicit queue, idempotence, explicit result revision, conflict, restart, cancellation. Controlled model/report; NO inference or worker.',
    );
  } finally {
    if (app) await app.close();
    if (sql) await sql.end();
    if (created && /^sounds_chat_test_[a-f0-9]{32}$/.test(name))
      await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.end();
    process.env.DATABASE_URL = original;
    if (
      directory &&
      path.dirname(directory) === path.resolve('../../.tmp') &&
      path.basename(directory).startsWith('kre05-')
    )
      await rm(directory, { recursive: true });
  }
}
main().catch((error) => {
  console.error(
    'KRE-05 integration failed:',
    String(error.stack).replace(/postgres(?:ql)?:\/\/\S+/g, '[redacted]'),
  );
  process.exitCode = 1;
});
