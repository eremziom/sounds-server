require('reflect-metadata');
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');
const {
  mkdtemp,
  readFile,
  readdir,
  rm,
  mkdir,
  writeFile,
  copyFile,
} = require('node:fs/promises');
const { deflateSync } = require('node:zlib');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { once } = require('node:events');
const { setTimeout: delay } = require('node:timers/promises');
const path = require('node:path');
const { Test } = require('@nestjs/testing');
const { ConfigService } = require('@nestjs/config');
const request = require('supertest');
const { PrismaService } = require('../dist/src/prisma/prisma.service.js');
const { ArtworksService } = require('../dist/src/artworks/artworks.service.js');
const {
  ArtworkStorageService,
} = require('../dist/src/artworks/artwork-storage.service.js');
const {
  ArtworkJobsService,
} = require('../dist/src/artwork-jobs/artwork-jobs.service.js');
const {
  ArtworkJobRunner,
} = require('../dist/src/artwork-jobs/artwork-job-runner.js');
const {
  ArtworkJobsController,
} = require('../dist/src/artwork-jobs/artwork-jobs.controller.js');
const { JwtAuthGuard } = require('../dist/src/auth/jwt-auth.guard.js');
const {
  createApiValidationPipe,
} = require('../dist/src/common/api-validation.pipe.js');
const repo = path.resolve('../..');
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const b of bytes) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function png(width, height, mask = false) {
  const chunk = (name, data) => {
    const kind = Buffer.from(name),
      len = Buffer.alloc(4),
      crc = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    crc.writeUInt32BE(crc32(Buffer.concat([kind, data])));
    return Buffer.concat([len, kind, data, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * (width * 3 + 1) + 1 + x * 3,
        on =
          x > width * 0.2 &&
          x < width * 0.8 &&
          y > height * 0.2 &&
          y < height * 0.8;
      raw[i] = mask ? (on ? 255 : 0) : on ? 45 : 20;
      raw[i + 1] = mask ? raw[i] : on ? 220 : 30;
      raw[i + 2] = mask ? raw[i] : on ? 240 : 40;
    }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
async function waitUntil(fn) {
  for (let i = 0; i < 200; i++) {
    const v = await fn();
    if (v) return v;
    await delay(25);
  }
  throw Error('Condition timed out');
}
async function main() {
  const name = 'sounds_jobs_test_' + randomUUID().replaceAll('-', ''),
    original = process.env.DATABASE_URL;
  const admin = new Pool({
      connectionString: original,
      connectionTimeoutMillis: 5000,
    }),
    url = new URL(original);
  url.pathname = '/' + name;
  let created = false,
    sql,
    db,
    app,
    temp;
  const evidence = {
    date: new Date().toISOString(),
    deterministic: null,
    models: [],
    scope: 'No production artwork; small fixtures only',
  };
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    created = true;
    sql = new Pool({ connectionString: url.toString() });
    const migrations = path.resolve('prisma/migrations');
    for (const e of (await readdir(migrations, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name)))
      await sql.query(
        await readFile(path.join(migrations, e.name, 'migration.sql'), 'utf8'),
      );
    process.env.DATABASE_URL = url.toString();
    db = new PrismaService();
    await db.$connect();
    temp = await mkdtemp(path.join(repo, '.tmp/kre02-'));
    const settings = {
      DATABASE_URL: url.toString(),
      ARTWORK_REPO_ROOT: repo,
      ARTWORK_JOB_ROOT: path.join(temp, 'work'),
      ARTWORK_STORAGE_DIR: path.join(temp, 'files'),
      AUDIO_STORAGE_DIR: path.join(temp, 'audio'),
    };
    const config = new ConfigService(settings),
      storage = new ArtworkStorageService(config),
      artworks = new ArtworksService(db, storage),
      jobs = new ArtworkJobsService(db);
    const makeRunner = () => {
      const runner = new ArtworkJobRunner(db, storage, config);
      runner.sampleMemory = async () => ({
        ramAvailableBytes: 16 * 2 ** 30,
        commitAvailableBytes: 12 * 2 ** 30,
        vramAvailableBytes: 12 * 2 ** 30,
        adapter: 'AMD Radeon RX 7800 XT',
        adapterKey: 'luid_fixture',
      });
      return runner;
    };
    let runner = makeRunner();
    const owner = await db.user.create({
        data: {
          username: 'owner',
          email: 'owner@example.test',
          password: 'unused',
        },
      }),
      other = await db.user.create({
        data: {
          username: 'other',
          email: 'other@example.test',
          password: 'unused',
        },
      });
    const project = await artworks.create(owner.id, 'Queue fixture'),
      reg = randomUUID();
    const image = await artworks.upload(
      project.id,
      owner.id,
      {
        kind: 'image',
        inputIds: [],
        registrationId: reg,
        provenance: { fixture: true },
      },
      png(512, 288),
    );
    const mask = await artworks.upload(
      project.id,
      owner.id,
      {
        kind: 'visibility-mask',
        inputIds: [image.id],
        registrationId: reg,
        provenance: { fixture: true },
      },
      png(512, 288, true),
    );
    const snapshot = {
      schemaVersion: 1,
      brief: {
        intent: 'API fixture',
        guidelinesVersion: '1.7',
        guidelinesPath:
          'apps/ui/src/engines/infinite-zoom/artwork-authoring-guidelines.md',
        composition: 'A geometric fixture only, not a production scene.',
        motionPlan: 'No artwork QA claimed.',
        lightingPlan: 'Fixture',
        blackoutPlan: 'Fixture',
        qaPlan: 'Contract checks only',
      },
      layers: [
        {
          id: 'base',
          imageArtifactId: image.id,
          maskArtifactIds: [],
          parameters: {},
        },
        {
          id: 'object',
          imageArtifactId: image.id,
          maskArtifactIds: [mask.id],
          parameters: { maskAssetId: mask.id },
        },
      ],
      artifactIds: [image.id, mask.id],
      decisions: [],
    };
    const revision = await artworks.save(project.id, owner.id, { snapshot });
    let baseRevisionId = revision.id;
    const module = await Test.createTestingModule({
      controllers: [ArtworkJobsController],
      providers: [{ provide: ArtworkJobsService, useValue: jobs }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(ctx) {
          const r = ctx.switchToHttp().getRequest(),
            id = Number(r.headers['x-fixture-user']);
          if (![owner.id, other.id].includes(id)) {
            const { UnauthorizedException } = require('@nestjs/common');
            throw new UnauthorizedException();
          }
          r.user = { userId: id };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(createApiValidationPipe());
    await app.init();
    const http = request(app.getHttpServer()),
      base = `/artworks/projects/${project.id}/jobs`;
    const post = (uri, body, user = owner.id) =>
      http.post(uri).set('x-fixture-user', String(user)).send(body);
    const body = (tool, args, inputIds = [], key = randomUUID()) => ({
      baseRevisionId,
      requestKey: key,
      tool,
      arguments: args,
      inputIds,
    });
    const enqueue = (tool, args, inputs = []) =>
      jobs.enqueue(project.id, owner.id, body(tool, args, inputs));
    await http.get('/artworks/tools').expect(401);
    assert.equal(
      Object.keys(
        (
          await http
            .get('/artworks/tools')
            .set('x-fixture-user', String(owner.id))
            .expect(200)
        ).body,
      ).length,
      18,
    );
    await post(
      base,
      body('extractLayer', {}, [image.id, mask.id]),
      other.id,
    ).expect(404);
    await post(base, body('exec', { command: 'x' })).expect(400);
    const dto = body(
      'refineMask',
      { operation: 'dilate', radius: 1, role: 'occlusion-mask' },
      [image.id, mask.id],
    );
    const duplicate = await Promise.all([
      post(base, dto).expect(201),
      post(base, dto).expect(201),
    ]);
    assert.equal(duplicate[0].body.id, duplicate[1].body.id);
    assert.equal(duplicate[0].body.runToken, undefined);
    await post(base, {
      ...dto,
      arguments: { ...dto.arguments, radius: 2 },
    }).expect(409);
    assert.deepEqual(
      (await Promise.all([runner.tick(), makeRunner().tick()])).sort(),
      [false, true],
    );
    const completed = await jobs.get(
      project.id,
      owner.id,
      duplicate[0].body.id,
    );
    assert.equal(completed.state, 'succeeded');
    assert.equal(completed.result.applied, false);
    assert.equal(
      await db.artworkArtifact.count({ where: { jobId: completed.id } }),
      1,
    );
    await assert.rejects(
      jobs.retry(project.id, owner.id, completed.id),
      (e) => e.getStatus() === 409,
    );
    // A mask cannot silently attach to another image, even at equal dimensions.
    // Only an explicit registered transfer creates that new dependency.
    const otherImage = await artworks.upload(
      project.id,
      owner.id,
      {
        kind: 'image',
        inputIds: [],
        registrationId: randomUUID(),
        provenance: { fixture: true },
      },
      png(512, 288),
    );
    await post(base, body('extractLayer', {}, [otherImage.id, mask.id])).expect(
      400,
    );
    const transfer = await enqueue('registerMap', { role: 'visibility-mask' }, [
      otherImage.id,
      mask.id,
    ]);
    await runner.tick();
    const transferred = await jobs.get(project.id, owner.id, transfer.id);
    assert.equal(transferred.state, 'succeeded');
    const transferredId = transferred.result.outputs[0].artifactId;
    await post(
      base,
      body('composeMasks', { operation: 'union', role: 'material-mask' }, [
        image.id,
        mask.id,
        transferredId,
      ]),
    ).expect(400);
    const attached = await enqueue('extractLayer', {}, [
      otherImage.id,
      transferredId,
    ]);
    await runner.tick();
    assert.equal(
      (await jobs.get(project.id, owner.id, attached.id)).state,
      'succeeded',
    );
    const newer = await artworks.save(project.id, owner.id, {
      baseRevisionId: revision.id,
      snapshot: { ...snapshot, decisions: ['Newer work'] },
    });
    const pending = await enqueue('extractLayer', {}, [image.id, mask.id]);
    await runner.tick();
    assert.equal(
      (await db.artworkProject.findUnique({ where: { id: project.id } }))
        .activeRevisionId,
      newer.id,
    );
    assert.equal(
      (await jobs.get(project.id, owner.id, pending.id)).result.baseRevisionId,
      revision.id,
    );
    const cancelQueued = await enqueue('extractLayer', {}, [image.id, mask.id]);
    await jobs.cancel(project.id, owner.id, cancelQueued.id);
    assert.equal(
      (await jobs.get(project.id, owner.id, cancelQueued.id)).state,
      'cancelled',
    );
    const cancelRunning = await enqueue(
      'refineMask',
      { operation: 'feather', radius: 50, role: 'material-mask' },
      [image.id, mask.id],
    );
    const active = runner.tick();
    await waitUntil(
      async () =>
        !!(await db.artworkJob.findUnique({ where: { id: cancelRunning.id } }))
          .childPid,
    );
    await jobs.cancel(project.id, owner.id, cancelRunning.id);
    await active;
    assert.equal(
      (await jobs.get(project.id, owner.id, cancelRunning.id)).state,
      'cancelled',
    );
    assert.equal(
      await db.artworkArtifact.count({ where: { jobId: cancelRunning.id } }),
      0,
    );
    await jobs.retry(project.id, owner.id, cancelRunning.id);
    await runner.tick();
    assert.equal(
      (await jobs.get(project.id, owner.id, cancelRunning.id)).state,
      'succeeded',
    );
    const deferred = await enqueue('generateImage', {
      prompt: 'fixture',
      seed: 1,
      width: 512,
      height: 288,
    });
    const low = makeRunner();
    low.sampleMemory = async () => ({
      ramAvailableBytes: 16 * 2 ** 30,
      commitAvailableBytes: 1,
      vramAvailableBytes: 12 * 2 ** 30,
      adapter: 'AMD Radeon RX 7800 XT',
      adapterKey: 'luid_fixture',
    });
    await low.tick();
    const held = await jobs.get(project.id, owner.id, deferred.id);
    assert.equal(held.state, 'queued');
    assert.equal(held.errorCode, 'MEMORY_DEFERRED');
    assert.equal(held.attempt, 0);
    await jobs.cancel(project.id, owner.id, deferred.id);
    const unknownMemory = await enqueue('extractLayer', {}, [
      image.id,
      mask.id,
    ]);
    low.sampleMemory = async () => {
      throw Error('No counters');
    };
    await low.tick();
    assert.equal(
      (await jobs.get(project.id, owner.id, unknownMemory.id)).errorCode,
      'MEMORY_TELEMETRY_UNAVAILABLE',
    );
    await jobs.cancel(project.id, owner.id, unknownMemory.id);
    for (const [tool, args, inputs] of [
      ['createColorPlate', { width: 16, height: 9, rgb: [0, 0, 0] }, []],
      ['createMask', { role: 'visibility-mask', value: 255 }, [image.id]],
      [
        'composeMasks',
        { role: 'material-mask', operation: 'intersect' },
        [image.id, mask.id, completed.result.outputs[0].artifactId],
      ],
      ['registerMap', { role: 'occlusion-mask' }, [image.id, mask.id]],
      ['inspectSelection', {}, [image.id, mask.id]],
      ['registerImage', { width: 1024, height: 576 }, [image.id]],
      [
        'deriveLightSelection',
        { minLuma: 100, minSaturation: 0.3 },
        [image.id, mask.id],
      ],
      ['buildInfluenceMap', { feather: 2 }, [image.id, mask.id]],
      [
        'buildDelayMap',
        {
          direction: 'path',
          path: [
            { x: 100, y: 100 },
            { x: 200, y: 150 },
            { x: 400, y: 100 },
          ],
        },
        [image.id, mask.id],
      ],
      ['buildPreviewPackage', {}, []],
      [
        'setBehaviors',
        {
          layerId: 'base',
          behaviors: [
            {
              id: 'pulse',
              kind: 'pulse',
              order: 0,
              params: { frequencyHz: 0.2, phase: 0, amount: 0.1 },
            },
          ],
        },
        [],
      ],
      [
        'setTravel',
        {
          layerId: 'base',
          travel: {
            startSeconds: 0,
            durationSeconds: 10,
            x: 100,
            y: 0,
          },
        },
        [],
      ],
      [
        'setTravel',
        {
          layerId: 'object',
          travel: {
            startSeconds: 0,
            durationSeconds: 10,
            path: {
              kind: 'bezier',
              segments: [
                {
                  control1: { x: 100, y: -100 },
                  control2: { x: 300, y: 100 },
                  to: { x: 500, y: 0 },
                },
              ],
            },
            easing: 'ease-in-out',
          },
        },
        [],
      ],
    ]) {
      const job = await enqueue(tool, args, inputs);
      await runner.tick();
      const end = await jobs.get(project.id, owner.id, job.id);
      if (tool === 'setTravel' && args.layerId === 'base') {
        assert.equal(end.state, 'failed', 'coverage base may not travel');
        for (let retry = 0; retry < 2; retry++) {
          await jobs.retry(project.id, owner.id, job.id);
          await runner.tick();
        }
        assert.equal((await jobs.get(project.id, owner.id, job.id)).attempt, 3);
        await assert.rejects(
          jobs.retry(project.id, owner.id, job.id),
          (e) => e.getStatus() === 409,
        );
      } else assert.equal(end.state, 'succeeded', `${tool}: ${end.errorCode}`);
    }
    // Kill only our fixture supervisor, not application/model processes belonging to the user.
    const crashed = await enqueue(
      'refineMask',
      { operation: 'feather', radius: 50, role: 'material-mask' },
      [image.id, mask.id],
    );
    const harness = path.join(temp, 'crash-runner.cjs');
    await writeFile(
      harness,
      `require(${JSON.stringify(require.resolve('reflect-metadata'))});const {ConfigService}=require(${JSON.stringify(require.resolve('@nestjs/config'))});const {PrismaService}=require(${JSON.stringify(path.join(repo, 'apps/api/dist/src/prisma/prisma.service.js'))});const {ArtworkStorageService}=require(${JSON.stringify(path.join(repo, 'apps/api/dist/src/artworks/artwork-storage.service.js'))});const {ArtworkJobRunner}=require(${JSON.stringify(path.join(repo, 'apps/api/dist/src/artwork-jobs/artwork-job-runner.js'))});const config=new ConfigService(JSON.parse(process.env.FIXTURE_CONFIG)),db=new PrismaService();const runner=new ArtworkJobRunner(db,new ArtworkStorageService(config),config);runner.sampleMemory=async()=>({ramAvailableBytes:16*2**30,commitAvailableBytes:12*2**30,vramAvailableBytes:12*2**30,adapter:'AMD Radeon RX 7800 XT',adapterKey:'luid_fixture'});db.$connect().then(()=>runner.tick()).finally(()=>db.$disconnect());`,
    );
    const supervised = spawn(process.execPath, [harness], {
      windowsHide: true,
      stdio: 'ignore',
      env: { ...process.env, FIXTURE_CONFIG: JSON.stringify(settings) },
    });
    const supervisedCompletion = once(supervised, 'close');
    let childPid;
    try {
      childPid = await waitUntil(async () => {
        if (supervised.exitCode !== null)
          throw Error('Fixture supervisor exited before claim');
        const j = await db.artworkJob.findUnique({ where: { id: crashed.id } });
        return j.childPid;
      });
    } finally {
      supervised.kill('SIGKILL');
      await supervisedCompletion;
    }
    await waitUntil(async () => {
      try {
        process.kill(childPid, 0);
        return false;
      } catch {
        return true;
      }
    });
    runner = makeRunner();
    await runner.tick();
    assert.equal(
      (await jobs.get(project.id, owner.id, crashed.id)).errorCode,
      'WORKER_INTERRUPTED',
    );
    assert.equal(
      await db.artworkArtifact.count({ where: { jobId: crashed.id } }),
      0,
    );
    await jobs.retry(project.id, owner.id, crashed.id);
    await runner.tick();
    assert.equal(
      (await jobs.get(project.id, owner.id, crashed.id)).state,
      'succeeded',
    );
    const interrupted = await enqueue('extractLayer', {}, [image.id, mask.id]),
      token = randomUUID(),
      attempt = path.join(temp, 'work', interrupted.id, token);
    await mkdir(attempt, { recursive: true });
    const orphanKey = randomUUID() + '.json';
    await storage.write(Buffer.from('{}'), 'report', orphanKey);
    const existing = await db.artworkArtifact.findUnique({
      where: { id: image.id },
    });
    await writeFile(
      path.join(attempt, 'journal.json'),
      JSON.stringify([orphanKey, existing.storageKey]),
    );
    await db.artworkJob.update({
      where: { id: interrupted.id },
      data: { state: 'running', runToken: token, attempt: 1 },
    });
    await runner.tick();
    const remaining = await readdir(path.join(temp, 'files'));
    assert.ok(!remaining.includes(orphanKey));
    assert.ok(remaining.includes(existing.storageKey));
    assert.equal(
      (await db.artworkProject.findUnique({ where: { id: project.id } }))
        .activeRevisionId,
      newer.id,
    );
    evidence.deterministic =
      'passed: HTTP ownership/idempotency, process concurrency/cancellation/crash recovery, retries, memory deferral, output transaction/journal cleanup, no implicit apply, tools/manifest parser';
    if (process.argv.includes('--models')) {
      const sampleDirectory = await mkdtemp(
        path.join(repo, '.tmp/kre02-model-samples-'),
      );
      evidence.sampleDirectory = path
        .relative(repo, sampleDirectory)
        .replaceAll('\\', '/');
      await writeFile(
        path.join(sampleDirectory, 'input-source.png'),
        png(512, 288),
      );
      await writeFile(
        path.join(sampleDirectory, 'input-mask.png'),
        png(512, 288, true),
      );
      const modelRevision = await artworks.save(project.id, owner.id, {
        baseRevisionId: newer.id,
        snapshot: {
          ...snapshot,
          brief: {
            ...snapshot.brief,
            intent: 'KRE-02 local adapter smoke, unverified garden/drone draft',
            composition:
              'Nocturnal stone gateway in a layered garden; a small cyan survey drone starts at left-middle, with open flight space through the gateway.',
            motionPlan:
              'Drone separate layer, curved left-to-right flight behind the right pillar; clean backing along the route, preserved narrow contours and authored occlusion. Motion/zoom QA remains pending KRE-03.',
            lightingPlan:
              'Many stone fissures and leaf-vein bands in several foreground and distant groups; cyan-magenta-amber longitudinal gradients, separate material selections, influence and delay maps; later staggered impulses.',
            blackoutPlan:
              'Unlit garden reaches black; independent vein and drone-lamp layers retain colors/impulses from the first frame. Smooth reveal, shadow and pause/zoom QA pending.',
            qaPlan:
              'Adapter output only, no artistic acceptance. Preserve actual source resolution; full motion, occlusion, lighting-cycle, blackout/reveal, pause/reset and zoom review remains KRE-03.',
          },
        },
      });
      baseRevisionId = modelRevision.id;
      const real = new ArtworkJobRunner(db, storage, config);
      for (const [tool, args, inputs] of [
        [
          'segmentObject',
          {
            points: [
              { x: 260, y: 140, label: 1 },
              { x: 20, y: 20, label: 0 },
            ],
            box: [80, 30, 440, 260],
            role: 'visibility-mask',
          },
          [image.id],
        ],
        ['fillBackground', { dilation: 2 }, [image.id, mask.id]],
        [
          'generateImage',
          {
            prompt:
              'A quiet garden with material-integrated colored light veins and a small moving survey drone. Painterly coherent layered composition.',
            seed: 500,
            width: 512,
            height: 288,
          },
          [],
        ],
        [
          'editImage',
          {
            prompt:
              'Change only the cyan rectangle to saturated red, preserve background.',
            seed: 600,
          },
          [image.id, mask.id],
        ],
      ]) {
        const job = await enqueue(tool, args, inputs);
        const start = Date.now();
        await real.tick();
        const end = await jobs.get(project.id, owner.id, job.id);
        const outputArtifacts = await db.artworkArtifact.findMany({
          where: { jobId: job.id },
        });
        for (const artifact of outputArtifacts) {
          const filename =
            tool +
            '-' +
            artifact.outputName +
            '.' +
            (artifact.mimeType === 'image/png' ? 'png' : 'json');
          await copyFile(
            path.join(temp, 'files', artifact.storageKey),
            path.join(sampleDirectory, filename),
          );
          await writeFile(
            path.join(sampleDirectory, tool + '-provenance.json'),
            JSON.stringify(artifact.provenance, null, 2),
          );
          if (artifact.provenance.brief)
            await writeFile(
              path.join(sampleDirectory, tool + '-authoring-brief.md'),
              '# Unverified KRE-02 adapter sample\n\nGuidelines: [shared v' +
                artifact.provenance.brief.guidelinesVersion +
                '](' +
                path
                  .relative(
                    sampleDirectory,
                    path.join(repo, artifact.provenance.brief.guidelinesPath),
                  )
                  .replaceAll('\\', '/') +
                ').\n\n' +
                Object.entries(artifact.provenance.brief)
                  .map(([key, value]) => '## ' + key + '\n' + value + '\n')
                  .join('\n') +
                '\nMotion/zoom and visual acceptance remain pending KRE-03.\n',
            );
        }
        evidence.models.push({
          tool,
          state: end.state,
          errorCode: end.errorCode,
          wallSeconds: (Date.now() - start) / 1000,
          memory: end.memory,
          result: end.result,
          artifacts: outputArtifacts.map((a) => ({
            kind: a.kind,
            sha256: a.sha256,
            width: a.width,
            height: a.height,
            sizeBytes: a.sizeBytes,
          })),
        });
        if (tool === 'editImage' && end.state === 'succeeded') {
          const check = await promisify(execFile)(
            path.join(repo, '.local/kre00/venvs/onnx/Scripts/python.exe'),
            [
              '-B',
              path.join(repo, 'apps/artwork-worker/inspect-edit.py'),
              path.join(sampleDirectory, 'input-source.png'),
              path.join(sampleDirectory, 'editImage-result.png'),
              path.join(sampleDirectory, 'input-mask.png'),
            ],
            { windowsHide: true, timeout: 30000 },
          );
          const pixels = JSON.parse(check.stdout);
          evidence.models.at(-1).pixelCheck = pixels;
          await writeFile(
            path.join(sampleDirectory, 'edit-pixel-check.json'),
            JSON.stringify(pixels, null, 2),
          );
          assert.ok(
            pixels.outsideMaskExact &&
              pixels.insideChangedPixels > 0 &&
              pixels.redPixelFraction > 0.8,
            'Masked color edit must preserve the outside and change the selected material to red',
          );
        }
        if (end.state === 'queued' && end.errorCode === 'MEMORY_DEFERRED')
          await jobs.cancel(project.id, owner.id, job.id);
        else assert.equal(end.state, 'succeeded', `${tool}: ${end.errorCode}`);
      }
    }
    if (process.env.KRE02_EVIDENCE) {
      const destination = path.resolve(process.env.KRE02_EVIDENCE);
      if (!destination.startsWith(path.join(repo, '.tmp') + path.sep))
        throw Error('Evidence destination must be under .tmp');
      await writeFile(destination, JSON.stringify(evidence, null, 2));
    }
    console.log('KRE-02 integration:', JSON.stringify(evidence));
  } finally {
    if (app) await app.close();
    if (db) await db.$disconnect();
    if (sql) await sql.end();
    if (created && /^sounds_jobs_test_[a-f0-9]{32}$/.test(name))
      await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.end();
    process.env.DATABASE_URL = original;
    if (
      temp &&
      path.dirname(temp) === path.join(repo, '.tmp') &&
      path.basename(temp).startsWith('kre02-')
    )
      await rm(temp, { recursive: true });
  }
}
main().catch((e) => {
  console.error(
    'KRE-02 integration failed:',
    String(e.stack).replace(/postgres(?:ql)?:\/\/\S+/g, '[redacted]'),
  );
  process.exitCode = 1;
});
