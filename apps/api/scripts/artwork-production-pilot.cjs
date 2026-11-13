/* Persistent, isolated KRE-03 acceptance API. Never uses application users or edits result pixels. */
require('reflect-metadata');
require('dotenv').config({ quiet: true });
const { Pool } = require('pg');
const { randomUUID, randomBytes } = require('node:crypto');
const {
  readFile,
  writeFile,
  readdir,
  mkdir,
  open,
} = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { Test } = require('@nestjs/testing');
const { ConfigService } = require('@nestjs/config');
const { PrismaService } = require('../dist/src/prisma/prisma.service.js');
const { ArtworksService } = require('../dist/src/artworks/artworks.service.js');
const {
  ArtworkStorageService,
} = require('../dist/src/artworks/artwork-storage.service.js');
const {
  ArtworksController,
} = require('../dist/src/artworks/artworks.controller.js');
const {
  ArtworkJobsService,
} = require('../dist/src/artwork-jobs/artwork-jobs.service.js');
const {
  ArtworkJobsController,
} = require('../dist/src/artwork-jobs/artwork-jobs.controller.js');
const { JwtAuthGuard } = require('../dist/src/auth/jwt-auth.guard.js');
const {
  createApiValidationPipe,
} = require('../dist/src/common/api-validation.pipe.js');
const repo = path.resolve('../..');
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
async function main() {
  const directory = path.resolve(
    arg('--directory') ??
      path.join(repo, '.local/kre03/runs', 'pilot-' + Date.now()),
  );
  if (!directory.startsWith(path.join(repo, '.local/kre03/runs') + path.sep))
    throw Error('Expected private KRE-03 run directory');
  await mkdir(directory, { recursive: true });
  console.log('KRE-03 run: ' + directory);
  const metaPath = path.join(directory, 'fixture.json');
  let metadata;
  try {
    metadata = JSON.parse(await readFile(metaPath, 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  const original = process.env.DATABASE_URL,
    admin = new Pool({
      connectionString: original,
      connectionTimeoutMillis: 5000,
    });
  let app, db, worker, workerDone, log;
  try {
    if (!metadata) {
      metadata = {
        databaseName:
          'sounds_production_test_' + randomUUID().replaceAll('-', ''),
        scope:
          'KRE-03 persistent isolated API fixture, not a published library scene',
      };
      await admin.query('CREATE DATABASE "' + metadata.databaseName + '"');
      const url = new URL(original);
      url.pathname = '/' + metadata.databaseName;
      const sql = new Pool({ connectionString: url.toString() });
      try {
        const migrations = path.resolve('prisma/migrations');
        for (const e of (await readdir(migrations, { withFileTypes: true }))
          .filter((e) => e.isDirectory())
          .sort((a, b) => a.name.localeCompare(b.name)))
          await sql.query(
            await readFile(
              path.join(migrations, e.name, 'migration.sql'),
              'utf8',
            ),
          );
      } finally {
        await sql.end();
      }
      await writeFile(metaPath, JSON.stringify(metadata, null, 2), {
        flag: 'wx',
      });
    }
    if (!/^sounds_production_test_[a-f0-9]{32}$/.test(metadata.databaseName))
      throw Error('Unexpected fixture database');
    const url = new URL(original);
    url.pathname = '/' + metadata.databaseName;
    process.env.DATABASE_URL = url.toString();
    const settings = {
      DATABASE_URL: url.toString(),
      ARTWORK_REPO_ROOT: repo,
      ARTWORK_JOB_ROOT: path.join(directory, 'work'),
      ARTWORK_STORAGE_DIR: path.join(directory, 'artifacts'),
      AUDIO_STORAGE_DIR: path.join(directory, 'audio-unused'),
    };
    const config = new ConfigService(settings);
    db = new PrismaService();
    await db.$connect();
    const owner = await db.user.upsert({
      where: { username: 'kre03-producer' },
      update: {},
      create: {
        username: 'kre03-producer',
        email: 'kre03-producer@example.test',
        password: 'fixture-unused',
      },
    });
    const bearer = randomBytes(32).toString('hex');
    const module = await Test.createTestingModule({
      controllers: [ArtworksController, ArtworkJobsController],
      providers: [
        ArtworksService,
        ArtworkStorageService,
        ArtworkJobsService,
        { provide: PrismaService, useValue: db },
        { provide: ConfigService, useValue: config },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context) {
          const request = context.switchToHttp().getRequest();
          if (request.headers.authorization !== 'Bearer ' + bearer) {
            const { UnauthorizedException } = require('@nestjs/common');
            throw new UnauthorizedException();
          }
          request.user = { userId: owner.id };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(createApiValidationPipe());
    await app.listen(0, '127.0.0.1');
    log = await open(
      path.join(directory, 'supervisor-' + Date.now() + '.log'),
      'wx',
      0o600,
    );
    worker = spawn(process.execPath, ['dist/src/artwork-jobs/worker.js'], {
      cwd: path.join(repo, 'apps/api'),
      windowsHide: true,
      env: { ...process.env, ...settings, ARTWORK_POLL_MS: '500' },
    });
    workerDone = once(worker, 'close');
    worker.stdout.on('data', (b) => {
      void log.write(b);
    });
    worker.stderr.on('data', (b) => {
      void log.write(b);
    });
    const { produceScene } = await import(
      pathToFileURL(
        path.join(repo, 'apps/artwork-worker/production-client.mjs'),
      ).href
    );
    const recipe = JSON.parse(
      await readFile(
        arg('--recipe') ??
          path.join(
            repo,
            'planning/artwork-creator/pilots/gate-drone/recipe.json',
          ),
        'utf8',
      ),
    );
    const result = await produceScene({
      apiUrl: await app.getUrl(),
      headers: { Authorization: 'Bearer ' + bearer },
      recipe,
      directory,
      until: arg('--until'),
      onProgress: (event) => console.log('KRE-03 ' + JSON.stringify(event)),
    });
    await writeFile(
      path.join(directory, 'last-result.json'),
      JSON.stringify(
        {
          complete: result.complete,
          bundle: result.bundle ?? null,
          projectId: result.state.projectId,
          revisionId: result.state.revisionId,
        },
        null,
        2,
      ),
    );
    console.log(
      'KRE-03 result: ' +
        JSON.stringify({
          complete: result.complete,
          bundle: result.bundle ?? null,
        }),
    );
  } finally {
    if (worker && worker.exitCode === null) {
      worker.kill('SIGTERM');
      await workerDone;
    }
    if (log) await log.close();
    if (app) await app.close();
    if (db) await db.$disconnect();
    await admin.end();
    process.env.DATABASE_URL = original;
  }
}
main().catch((error) => {
  console.error(
    'KRE-03 failed:',
    String(error.message).replace(/postgres(?:ql)?:\/\/\S+/g, '[redacted]'),
  );
  process.exitCode = 1;
});
