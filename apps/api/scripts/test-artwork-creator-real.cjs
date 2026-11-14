/* Real Nest/JWT/PostgreSQL/worker + UI acceptance. Preserves its isolated DB/run for recovery. */
require('reflect-metadata');
require('dotenv').config({ quiet: true });
const { Pool } = require('pg');
const { randomUUID } = require('node:crypto');
const { readFile, writeFile, readdir, mkdir, copyFile, open } = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { Test } = require('@nestjs/testing');
const { ConfigService } = require('@nestjs/config');
const repo = path.resolve('../..');
const arg = name => { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; };
async function main() {
 const directory = path.resolve(arg('--directory') ?? path.join(repo, '.local/kre04/runs', 'acceptance-' + Date.now()));
 if (!directory.startsWith(path.join(repo, '.local/kre04/runs') + path.sep)) throw Error('Expected isolated KRE-04 directory');
 await mkdir(directory, { recursive: true }); console.log('KRE-04 run: ' + directory);
 const original = process.env.DATABASE_URL, admin = new Pool({ connectionString: original, connectionTimeoutMillis: 5000 });
 let metadata, app, db, worker, workerDone, log;
 try {
  const metaPath = path.join(directory, 'fixture.json');
  try { metadata = JSON.parse(await readFile(metaPath, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!metadata) {
   metadata = { databaseName: 'sounds_creator_test_' + randomUUID().replaceAll('-', ''), scope: 'KRE-04 isolated real API/JWT/worker acceptance' };
   await admin.query('CREATE DATABASE "' + metadata.databaseName + '"');
   const url = new URL(original); url.pathname = '/' + metadata.databaseName;
   const sql = new Pool({ connectionString: url.toString() });
   try {
    for (const entry of (await readdir('prisma/migrations', { withFileTypes: true })).filter(e => e.isDirectory()).sort((a,b) => a.name.localeCompare(b.name)))
     await sql.query(await readFile(path.join('prisma/migrations', entry.name, 'migration.sql'), 'utf8'));
    await sql.query(await readFile('prisma/seed-rbac.sql', 'utf8'));
   } finally { await sql.end(); }
   await writeFile(metaPath, JSON.stringify(metadata, null, 2), { flag: 'wx' });
  }
  if (!/^sounds_creator_test_[a-f0-9]{32}$/.test(metadata.databaseName)) throw Error('Invalid isolated database');
  const url = new URL(original); url.pathname = '/' + metadata.databaseName;
  const settings = { DATABASE_URL: url.toString(), ARTWORK_REPO_ROOT: repo, ARTWORK_JOB_ROOT: path.join(directory,'work'),
   ARTWORK_STORAGE_DIR: path.join(directory,'artifacts'), AUDIO_STORAGE_DIR: path.join(directory,'audio'), ARTWORK_POLL_MS: '500' };
  Object.assign(process.env, settings);
  const { AppModule } = require('../dist/src/app.module.js');
  const { PrismaService } = require('../dist/src/prisma/prisma.service.js');
  const { createApiValidationPipe } = require('../dist/src/common/api-validation.pipe.js');
  const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ConfigService).useValue(new ConfigService(process.env)).compile();
  app = module.createNestApplication({ logger: false }); app.useGlobalPipes(createApiValidationPipe()); await app.listen(0, '127.0.0.1');
  db = app.get(PrismaService);
  if(process.argv.includes('--inspect')){
   const projects=await db.artworkProject.findMany({select:{id:true,title:true,activeRevisionId:true,jobs:{select:{id:true,tool:true,state:true,phase:true,errorCode:true,memory:true}}}});
   await writeFile(path.join(directory,'inspection.json'),JSON.stringify(projects,null,2));
   console.log(JSON.stringify(projects,null,2));return;
  }
  const apiUrl = await app.getUrl(), sessionPath = path.join(directory, 'session.json');
  let session;
  try { session = JSON.parse(await readFile(sessionPath,'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!session) {
   const response = await fetch(apiUrl + '/auth/register', { method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ username: 'kre04-' + randomUUID().slice(0,8), email: randomUUID() + '@example.test', password: 'Kre04!' + randomUUID() }) });
   if (!response.ok) throw Error('Real registration failed: ' + response.status);
   session = await response.json(); await writeFile(sessionPath, JSON.stringify(session), { mode: 0o600 });
  } else {
   const response = await fetch(apiUrl + '/auth/refresh', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({refreshToken:session.refreshToken}) });
   if (!response.ok) throw Error('Persisted acceptance session refresh failed: ' + response.status);
   session = await response.json(); await writeFile(sessionPath, JSON.stringify(session), { mode: 0o600 });
  }
  await mkdir(path.join(settings.AUDIO_STORAGE_DIR,'files'), { recursive: true });
  if (!await db.track.findFirst({ where: { title: 'KRE-04 acceptance audio' } })) {
   const storageKey = randomUUID() + '.mp3';
   await copyFile('src/audio/fixtures/tone.mp3', path.join(settings.AUDIO_STORAGE_DIR,'files', storageKey));
   const bytes = await readFile(path.join(settings.AUDIO_STORAGE_DIR,'files', storageKey));
   await db.track.create({ data: { title:'KRE-04 acceptance audio', ownerId:session.user.id,
    audioFile:{create:{storageKey,originalName:'tone.mp3',mimeType:'audio/mpeg',sizeBytes:bytes.length}} } });
  }
  const audioTrack = await db.track.findFirst({ where:{title:'KRE-04 acceptance audio'},include:{audioFile:true} });
  await copyFile('src/audio/fixtures/tone.mp3',path.join(settings.AUDIO_STORAGE_DIR,'files',audioTrack.audioFile.storageKey));
  log = await open(path.join(directory,'worker-' + Date.now() + '.log'),'wx');
  worker = spawn(process.execPath,['dist/src/artwork-jobs/worker.js'], { cwd:path.join(repo,'apps/api'),windowsHide:true,env:{...process.env,...settings} });
  workerDone=once(worker,'close');worker.stdout.on('data',bytes=>{void log.write(bytes);});worker.stderr.on('data',bytes=>{void log.write(bytes);});
  const browser=spawn(process.execPath,['tests/artwork-creator-real.browser.mjs'],{cwd:path.join(repo,'apps/ui'),windowsHide:true,stdio:'inherit',
   env:{...process.env,KRE04_REAL_URL:apiUrl,KRE04_SESSION_FILE:sessionPath,KRE04_DIRECTORY:directory,...(process.argv.includes('--starter-only')?{KRE04_STARTER_ONLY:'1'}:{}),...(process.argv.includes('--tools-from-starter')?{KRE04_TOOLS_FROM_STARTER:'1'}:{}),...(process.argv.includes('--production-qa-only')||process.argv.includes('--correct-production')?{KRE04_PRODUCTION_QA_ONLY:'1'}:{}),...(process.argv.includes('--correct-production')?{KRE04_CORRECT_PRODUCTION:'1'}:{}),...(process.argv.includes('--correction-only')?{KRE04_CORRECTION_ONLY:'1'}:{})} });
  const [code]=await once(browser,'close');if(code!==0)throw Error('Real UI acceptance failed: '+code);
 } finally {
  if(worker&&worker.exitCode===null){worker.kill('SIGTERM');await workerDone;}
  if(log)await log.close();if(app)await app.close();await admin.end();process.env.DATABASE_URL=original;
 }
}
main().catch(error=>{console.error('KRE-04 acceptance: '+String(error.message).replace(/postgres(?:ql)?:\/\/\S+/g,'[redacted]'));process.exitCode=1;});
