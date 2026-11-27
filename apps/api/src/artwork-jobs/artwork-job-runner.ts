import { ConfigService } from '@nestjs/config';
import * as pg from 'pg';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID, createHash } from 'node:crypto';
import {
  mkdir,
  readFile,
  writeFile,
  lstat,
  realpath,
  open,
  rm,
} from 'node:fs/promises';
import { isAbsolute, join, resolve, relative, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, type ArtworkJob } from '../generated/prisma/client.cjs';
import { ArtworkStorageService } from '../artworks/artwork-storage.service';
import { assertPrivateDirectory } from '../audio/audio-config';
import { validateSnapshot } from '../artworks/artwork-snapshot';
import type { RevisionSnapshotDto } from '../artworks/artwork.dto';
import { validateTool } from '../artwork-tools/tool-registry';
import { admitMemory, type MemorySample } from './memory-budget';

const execute = promisify(execFile);
const LOCK = 720202611;
// The installed pg runtime has no directly exposed declaration package here.
// Describe the small session-lock surface without weakening runner types.
interface LockClient {
  on(event: 'error', callback: () => void): void;
  connect(): Promise<void>;
  query(
    sql: string,
    values: number[],
  ): Promise<{ rows: { locked: boolean }[] }>;
  end(): Promise<void>;
}
const Postgres = pg as unknown as {
  Client: new (settings: {
    connectionString: string;
    connectionTimeoutMillis: number;
  }) => LockClient;
};
const asJson = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code !== 'ESRCH';
  }
};
class JobFailure extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
interface Output {
  name: string;
  file: string;
  kind: string;
  registration: 'source' | 'new' | 'none';
}

/** A separate process owns this runner. The API process only persists requests. */
export class ArtworkJobRunner {
  private readonly repo: string;
  private readonly root: string;
  private stopping = false;
  private childAbort?: AbortController;
  constructor(
    private readonly db: PrismaService,
    private readonly storage: ArtworkStorageService,
    private readonly config: ConfigService,
  ) {
    this.repo = resolve(
      config.get<string>('ARTWORK_REPO_ROOT') ??
        join(__dirname, '../../../../..'),
    );
    this.root = resolve(config.getOrThrow<string>('ARTWORK_JOB_ROOT'));
    if (!isAbsolute(config.getOrThrow<string>('ARTWORK_JOB_ROOT')))
      throw new Error('ARTWORK_JOB_ROOT must be absolute');
    assertPrivateDirectory(this.root);
    for (const name of ['ARTWORK_STORAGE_DIR', 'AUDIO_STORAGE_DIR']) {
      const other = config.get<string>(name);
      if (other) {
        const overlap = (a: string, b: string) => {
          const p = relative(a, b);
          return p === '' || (!p.startsWith('..') && !isAbsolute(p));
        };
        if (
          overlap(this.root, resolve(other)) ||
          overlap(resolve(other), this.root)
        )
          throw new Error(
            'Job work directory must be separate from persistent stores',
          );
      }
    }
  }
  stop() {
    this.stopping = true;
    this.childAbort?.abort();
  }
  private directory(job: ArtworkJob) {
    if (
      !/^[a-f0-9-]{36}$/.test(job.id) ||
      !job.runToken ||
      !/^[a-f0-9-]{36}$/.test(job.runToken)
    )
      throw new JobFailure('INVALID_ATTEMPT');
    return join(this.root, job.id, job.runToken);
  }
  private async ensureDirectory(directory: string) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    if (
      (await lstat(directory)).isSymbolicLink() ||
      (await realpath(directory)).toLowerCase() !== directory.toLowerCase()
    )
      throw new JobFailure('UNSAFE_WORK_DIRECTORY');
  }
  private async check(job: ArtworkJob) {
    if (this.stopping) throw new JobFailure('WORKER_STOPPED');
    const current = await this.db.artworkJob.findUniqueOrThrow({
      where: { id: job.id },
    });
    if (current.cancelRequested) throw new JobFailure('CANCELLED');
    if (current.state !== 'running' || current.runToken !== job.runToken)
      throw new JobFailure('FENCED');
  }
  private async progress(job: ArtworkJob, phase: string, progress: number) {
    await this.check(job);
    const changed = await this.db.artworkJob.updateMany({
      where: {
        id: job.id,
        runToken: job.runToken,
        state: 'running',
        cancelRequested: false,
      },
      data: { phase, progress },
    });
    if (!changed.count) throw new JobFailure('FENCED');
  }
  private environment() {
    const data = join(this.repo, '.local/kre00');
    return {
      ...process.env,
      PYTHONNOUSERSITE: '1',
      HF_HUB_OFFLINE: '1',
      TRANSFORMERS_OFFLINE: '1',
      HF_HOME: join(data, 'cache/huggingface'),
      TORCH_HOME: join(data, 'cache/torch'),
      MIOPEN_USER_DB_PATH: join(data, 'cache/miopen-db'),
      MIOPEN_CUSTOM_CACHE_DIR: join(data, 'cache/miopen-kernels'),
      ARTWORK_JOB_ROOT: this.root,
      ARTWORK_MODELS_DIR:
        this.config.get<string>('ARTWORK_MODELS_DIR') ?? join(data, 'models'),
    };
  }
  async sampleMemory(): Promise<MemorySample> {
    const command = this.config.get<string>('ARTWORK_PROBE_PYTHON') ?? 'py';
    const result = await execute(
      command,
      ['-B', join(this.repo, 'apps/artwork-worker/memory-probe.py')],
      { windowsHide: true, timeout: 20000, maxBuffer: 64000 },
    );
    return JSON.parse(result.stdout) as MemorySample;
  }
  private async child(
    job: ArtworkJob,
    stage: string,
    directory: string,
    gpu: boolean,
    nativeNode = false,
  ) {
    const python =
      this.config.get<string>(
        gpu ? 'ARTWORK_GPU_PYTHON' : 'ARTWORK_CPU_PYTHON',
      ) ??
      join(
        this.repo,
        `.local/kre00/venvs/${gpu ? 'torch-rocm721' : 'onnx'}/Scripts/python.exe`,
      );
    const command = nativeNode ? process.execPath : python;
    const args = nativeNode
      ? [join(this.repo, 'apps/artwork-worker/build-package.mjs'), directory]
      : [
          '-B',
          join(this.repo, 'apps/artwork-worker/worker.py'),
          stage,
          directory,
        ];
    const abort = new AbortController();
    this.childAbort = abort;
    const log = await open(join(directory, stage + '.log'), 'wx', 0o600);
    const child = spawn(command, args, {
      cwd: this.repo,
      env: this.environment(),
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      signal: abort.signal,
    });
    let closed = false,
      exitCode: number | null = null,
      processError: Error | undefined;
    const completion = new Promise<void>((resolveDone) => {
      child.once('error', (e) => {
        processError = e;
      });
      child.once('close', (code) => {
        closed = true;
        exitCode = code;
        resolveDone();
      });
    });
    let logged = 0;
    let tail = '';
    const append = (data: Buffer) => {
      tail = (tail + data.toString('utf8')).slice(-64000);
      logged += data.length;
      if (logged <= 4 * 1024 * 1024) void log.write(data).catch(() => {});
    };
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    const started = Date.now();
    try {
      if (!child.pid) {
        await completion;
        throw new JobFailure('WORKER_SPAWN_FAILED');
      }
      let interpreterPid = child.pid;
      if (!nativeNode) {
        let found = false;
        while (!found && !closed && Date.now() - started < 15000) {
          await this.check(job);
          try {
            const identity = JSON.parse(
              await readFile(
                join(directory, 'identity-' + stage + '.json'),
                'utf8',
              ),
            ) as { pid: number };
            if (!Number.isSafeInteger(identity.pid) || identity.pid <= 0)
              throw new JobFailure('INVALID_PROCESS_IDENTITY');
            interpreterPid = identity.pid;
            found = true;
          } catch (error) {
            if (error instanceof JobFailure) throw error;
            if (
              (error as NodeJS.ErrnoException).code !== 'ENOENT' &&
              !(error instanceof SyntaxError)
            )
              throw error;
          }
          if (!found) await delay(25);
        }
        if (!found) throw new JobFailure('WORKER_IDENTITY_UNAVAILABLE');
      }
      const registered = await this.db.artworkJob.updateMany({
        where: {
          id: job.id,
          runToken: job.runToken,
          state: 'running',
          cancelRequested: false,
        },
        data: { childPid: interpreterPid },
      });
      if (!registered.count) throw new JobFailure('FENCED');
      child.stdin.write('START\n');
      while (!closed) {
        await delay(250);
        await this.check(job);
        if (stage === 'transform') {
          try {
            const p = JSON.parse(
              await readFile(join(directory, 'progress.json'), 'utf8'),
            ) as { step: number; total: number };
            if (
              Number.isSafeInteger(p.step) &&
              p.step >= 0 &&
              p.step <= 4 &&
              p.total === 4
            )
              await this.progress(
                job,
                'transform',
                33 + Math.floor(p.step * 7),
              );
          } catch (error) {
            if (error instanceof JobFailure) throw error;
          }
        }
        if (Date.now() - started > 600000) throw new JobFailure('TOOL_TIMEOUT');
      }
      if (exitCode !== 0 || processError)
        throw new JobFailure(
          /out of memory|os error 1455/i.test(tail)
            ? 'MODEL_OUT_OF_MEMORY'
            : /512-token/.test(tail)
              ? 'PROMPT_TOO_LONG'
              : /Unmeasured Klein dimensions/.test(tail)
                ? 'UNSUPPORTED_DIMENSIONS'
                : 'TOOL_EXECUTION_FAILED',
        );
    } finally {
      if (!closed) abort.abort();
      child.stdin.destroy();
      await completion;
      await log.close();
      this.childAbort = undefined;
      await this.db.artworkJob.updateMany({
        where: { id: job.id, runToken: job.runToken },
        data: { childPid: null },
      });
    }
  }
  private async cleanup(job: ArtworkJob) {
    if (!job.runToken) return;
    const directory = this.directory(job);
    try {
      if (
        (await lstat(directory)).isSymbolicLink() ||
        (await realpath(directory)).toLowerCase() !== directory.toLowerCase()
      )
        throw new JobFailure('UNSAFE_WORK_DIRECTORY');
      let keys: string[] = [];
      try {
        keys = JSON.parse(
          await readFile(join(directory, 'journal.json'), 'utf8'),
        ) as string[];
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      if (
        !Array.isArray(keys) ||
        keys.some(
          (k) =>
            typeof k !== 'string' || !/^[a-f0-9-]{36}\.(png|json)$/.test(k),
        )
      )
        throw new JobFailure('INVALID_JOURNAL');
      for (const key of keys) {
        if (
          !(await this.db.artworkArtifact.findUnique({
            where: { storageKey: key },
          }))
        ) {
          try {
            await this.storage.discard(key);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          }
        }
      }
      // Only this DB-recorded UUID attempt directory is eligible for recursive cleanup.
      if (!directory.startsWith(this.root + sep))
        throw new JobFailure('UNSAFE_WORK_DIRECTORY');
      await rm(directory, { recursive: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    await this.db.artworkJob.updateMany({
      where: {
        id: job.id,
        runToken: job.runToken,
        state: { in: ['failed', 'cancelled', 'succeeded', 'queued'] },
      },
      data: { runToken: null, childPid: null },
    });
  }
  private async run(job: ArtworkJob) {
    const directory = this.directory(job);
    try {
      await this.ensureDirectory(directory);
      const ids = job.inputIds as string[];
      const revision = await this.db.artworkRevision.findUniqueOrThrow({
        where: { id: job.baseRevisionId },
      });
      const snapshot = revision.snapshot as unknown as RevisionSnapshotDto;
      const artifacts = await this.db.artworkArtifact.findMany({
        where: { projectId: job.projectId },
        include: { inputs: { select: { inputId: true } } },
      });
      const definition = validateTool(job.tool, job.arguments, ids);
      const inputs = ids.map((id) => {
        const a = artifacts.find((v) => v.id === id);
        if (!a) throw new JobFailure('INPUT_MISSING');
        return a;
      });
      if (
        ['buildPreviewPackage', 'setBehaviors', 'setTravel'].includes(
          job.tool,
        ) &&
        !validateSnapshot(snapshot, artifacts).ready
      )
        throw new JobFailure('STALE_DEPENDENCIES');
      const guidelines = await readFile(
        join(
          this.repo,
          'apps/ui/src/engines/infinite-zoom/artwork-authoring-guidelines.md',
        ),
      );
      const guidelineHash = createHash('sha256')
        .update(guidelines)
        .digest('hex');
      const profileBytes = await readFile(
        join(this.repo, 'apps/artwork-worker/profile-lock.json'),
      );
      const profile = JSON.parse(profileBytes.toString('utf8')) as {
        models: Record<string, { repo: string; revision: string }>;
      };
      const provenanceFiles = [
        'apps/artwork-worker/worker.py',
        'apps/artwork-worker/prompts.py',
        'apps/artwork-worker/build-package.mjs',
        'tools/artwork-creator/image_ops.py',
        'tools/artwork-creator/bounded_attention.py',
        'tools/artwork-creator/klein_loading.py',
      ];
      const sourceHashes: Record<string, string> = {};
      for (const file of provenanceFiles)
        sourceHashes[file] = createHash('sha256')
          .update(await readFile(join(this.repo, file)))
          .digest('hex');
      if (definition.gpu === 'klein')
        await writeFile(
          join(directory, 'authoring-brief.md'),
          `# Operation ${job.id}\n\nGuidelines: [shared authoring guidelines](${snapshot.brief.guidelinesPath}), version ${snapshot.brief.guidelinesVersion}, SHA256 ${guidelineHash}.\n\n` +
            Object.entries(snapshot.brief)
              .map(([key, value]) => `## ${key}\n${value}\n`)
              .join('\n') +
            '\nUnverified operation output; motion/zoom and visual acceptance remain required.\n',
          { flag: 'wx', mode: 0o600 },
        );
      for (let i = 0; i < inputs.length; i++) {
        const stream = await this.storage.read(inputs[i].storageKey);
        const handle = await open(
          join(directory, `input-${i}.png`),
          'wx',
          0o600,
        );
        await pipeline(stream, handle.createWriteStream());
        const actual = createHash('sha256')
          .update(await readFile(join(directory, `input-${i}.png`)))
          .digest('hex');
        if (actual !== inputs[i].sha256)
          throw new JobFailure('INPUT_HASH_MISMATCH');
      }
      await writeFile(
        join(directory, 'request.json'),
        JSON.stringify({
          jobId: job.id,
          projectId: job.projectId,
          tool: job.tool,
          arguments: job.arguments,
          inputs,
          snapshot,
          artifacts: artifacts.filter((a) =>
            snapshot.artifactIds.includes(a.id),
          ),
        }),
        { flag: 'wx', mode: 0o600 },
      );
      const packageTool = [
        'buildPreviewPackage',
        'setBehaviors',
        'setTravel',
      ].includes(job.tool);
      const stages = packageTool
        ? ['package']
        : definition.gpu === 'klein'
          ? ['encode', 'transform', 'decode']
          : definition.gpu === 'sam'
            ? ['sam']
            : ['cpu'];
      const stageMemory: {
        phase: string;
        before: MemorySample;
        after: MemorySample;
      }[] = [];
      for (let i = 0; i < stages.length; i++) {
        await this.progress(
          job,
          stages[i],
          Math.floor((i * 85) / stages.length) + 5,
        );
        let sample: MemorySample;
        try {
          sample = await this.sampleMemory();
        } catch {
          throw new JobFailure('MEMORY_TELEMETRY_UNAVAILABLE');
        }
        await this.db.artworkJob.updateMany({
          where: { id: job.id, runToken: job.runToken },
          data: { memory: asJson(sample) },
        });
        const sourcePixels = Math.max(
          0,
          ...inputs.map((a) => (a.width ?? 0) * (a.height ?? 0)),
          job.tool === 'registerImage'
            ? Number((job.arguments as Record<string, unknown>).width) *
                Number((job.arguments as Record<string, unknown>).height)
            : 0,
        );
        if (!admitMemory(definition.gpu ?? 'cpu', sample, sourcePixels))
          throw new JobFailure('MEMORY_DEFERRED');
        await this.check(job);
        await this.child(
          job,
          stages[i],
          directory,
          !!definition.gpu,
          packageTool,
        );
        let after: MemorySample;
        try {
          after = await this.sampleMemory();
        } catch {
          throw new JobFailure('MEMORY_TELEMETRY_UNAVAILABLE');
        }
        stageMemory.push({ phase: stages[i], before: sample, after });
        // The next stage cannot begin until the owned process has exited.
      }
      await this.progress(job, 'validating-output', 90);
      const output = JSON.parse(
        await readFile(join(directory, 'result.json'), 'utf8'),
      ) as { outputs: Output[]; details: unknown };
      if (!Array.isArray(output.outputs) || output.outputs.length !== 1)
        throw new JobFailure('INVALID_TOOL_OUTPUT');
      for (const o of output.outputs)
        if (
          !/^[a-z][a-z0-9-]{0,63}$/.test(o.name) ||
          !/^[a-z][a-z0-9-]{0,63}\.(png|json)$/.test(o.file) ||
          ![
            'image',
            'visibility-mask',
            'occlusion-mask',
            'material-mask',
            'influence-map',
            'delay-map',
            'report',
          ].includes(o.kind) ||
          !['source', 'new', 'none'].includes(o.registration)
        )
          throw new JobFailure('INVALID_TOOL_OUTPUT');
      const keys = output.outputs.map(
        (o) => `${randomUUID()}.${o.kind === 'report' ? 'json' : 'png'}`,
      );
      const journal = await open(join(directory, 'journal.json'), 'wx', 0o600);
      try {
        await journal.writeFile(JSON.stringify(keys));
        await journal.sync();
      } finally {
        await journal.close();
      }
      const saved: {
        output: Output;
        data: Awaited<ReturnType<ArtworkStorageService['write']>>;
      }[] = [];
      for (let i = 0; i < output.outputs.length; i++) {
        const o = output.outputs[i],
          file = join(directory, o.file);
        if ((await lstat(file)).isSymbolicLink())
          throw new JobFailure('INVALID_TOOL_OUTPUT');
        saved.push({
          output: o,
          data: await this.storage.write(await readFile(file), o.kind, keys[i]),
        });
      }
      await this.check(job);
      let actualPrompt: string | undefined;
      if (definition.gpu === 'klein')
        actualPrompt = await readFile(
          join(directory, 'actual-prompt.txt'),
          'utf8',
        );
      await this.db.$transaction(async (tx) => {
        const locked = await tx.artworkJob.updateMany({
          where: {
            id: job.id,
            runToken: job.runToken,
            state: 'running',
            cancelRequested: false,
          },
          data: { phase: 'committing' },
        });
        if (!locked.count) throw new JobFailure('FENCED');
        const resultIds: { name: string; artifactId: string }[] = [];
        for (const { output: o, data } of saved) {
          const artifact = await tx.artworkArtifact.create({
            data: {
              ...data,
              projectId: job.projectId,
              jobId: job.id,
              outputName: o.name,
              kind: o.kind,
              registrationId:
                o.registration === 'new'
                  ? randomUUID()
                  : o.registration === 'source'
                    ? (inputs[0]?.registrationId ?? randomUUID())
                    : null,
              provenance: asJson({
                jobId: job.id,
                baseRevisionId: job.baseRevisionId,
                tool: job.tool,
                toolVersion: 'kre02-v1',
                arguments: job.arguments,
                guidelinesSha256: guidelineHash,
                modelProfileSha256: createHash('sha256')
                  .update(profileBytes)
                  .digest('hex'),
                models: Object.fromEntries(
                  Object.entries(profile.models).map(([key, value]) => [
                    key,
                    { repo: value.repo, revision: value.revision },
                  ]),
                ),
                sourceHashes,
                ...(actualPrompt
                  ? { actualPrompt, brief: snapshot.brief }
                  : {}),
              }),
            },
          });
          const dependencies = packageTool ? snapshot.artifactIds : ids;
          if (dependencies.length)
            await tx.artworkArtifactInput.createMany({
              data: dependencies.map((inputId) => ({
                artifactId: artifact.id,
                inputId,
                projectId: job.projectId,
              })),
            });
          resultIds.push({ name: o.name, artifactId: artifact.id });
        }
        await tx.artworkJob.update({
          where: { id: job.id },
          data: {
            state: 'succeeded',
            progress: 100,
            phase: 'succeeded',
            errorCode: null,
            finishedAt: new Date(),
            result: asJson({
              outputs: resultIds,
              details: { toolReport: output.details, stageMemory },
              baseRevisionId: job.baseRevisionId,
              applied: false,
            }),
          },
        });
      });
    } catch (error) {
      const code = error instanceof JobFailure ? error.code : 'WORKER_ERROR';
      if (
        code === 'MEMORY_DEFERRED' ||
        code === 'MEMORY_TELEMETRY_UNAVAILABLE'
      ) {
        await this.db.artworkJob.updateMany({
          where: { id: job.id, runToken: job.runToken, state: 'running' },
          data: {
            state: 'queued',
            attempt: { decrement: 1 },
            phase: code,
            errorCode: code,
            progress: 0,
            availableAt: new Date(Date.now() + 30000),
          },
        });
        await this.cleanup(job);
      } else {
        const current = await this.db.artworkJob.findUniqueOrThrow({
          where: { id: job.id },
        });
        await this.db.artworkJob.updateMany({
          where: { id: job.id, runToken: job.runToken, state: 'running' },
          data: {
            state: current.cancelRequested ? 'cancelled' : 'failed',
            phase: current.cancelRequested ? 'cancelled' : 'failed',
            errorCode: current.cancelRequested ? 'CANCELLED' : code,
            finishedAt: new Date(),
          },
        });
        await this.cleanup(job);
      }
      return;
    }
    await this.cleanup(job);
  }
  async tick() {
    if (this.stopping) return false;
    await this.ensureDirectory(this.root);
    const client = new Postgres.Client({
      connectionString: this.config.getOrThrow<string>('DATABASE_URL'),
      connectionTimeoutMillis: 5000,
    });
    let lockLost = false;
    client.on('error', () => {
      lockLost = true;
      this.childAbort?.abort();
    });
    await client.connect();
    try {
      if (
        !(
          await client.query('SELECT pg_try_advisory_lock($1) AS locked', [
            LOCK,
          ])
        ).rows[0].locked
      )
        return false;
      const old = await this.db.artworkJob.findMany({
        where: { runToken: { not: null } },
      });
      for (const job of old) {
        if (job.childPid && alive(job.childPid)) return false; // No second model while an orphan is still alive.
        if (job.state === 'running')
          await this.db.artworkJob.update({
            where: { id: job.id },
            data: {
              state: job.cancelRequested ? 'cancelled' : 'failed',
              phase: 'interrupted',
              errorCode: 'WORKER_INTERRUPTED',
              childPid: null,
              finishedAt: new Date(),
            },
          });
        await this.cleanup(job);
      }
      if (lockLost) throw new JobFailure('WORKER_LOCK_LOST');
      const next = await this.db.artworkJob.findFirst({
        where: {
          state: 'queued',
          runToken: null,
          cancelRequested: false,
          availableAt: { lte: new Date() },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      if (!next) return false;
      const claimed = await this.db.artworkJob.updateMany({
        where: {
          id: next.id,
          state: 'queued',
          runToken: null,
          cancelRequested: false,
        },
        data: {
          state: 'running',
          runToken: randomUUID(),
          attempt: { increment: 1 },
          progress: 1,
          phase: 'starting',
          startedAt: new Date(),
          errorCode: null,
        },
      });
      if (!claimed.count) return false;
      const job = await this.db.artworkJob.findUniqueOrThrow({
        where: { id: next.id },
      });
      await this.run(job);
      return true;
    } finally {
      await client.end();
    }
  }
}
