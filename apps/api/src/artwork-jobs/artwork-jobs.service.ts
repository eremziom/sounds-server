import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client.cjs';
import {
  matchesInput,
  TOOL_REGISTRY,
  validateTool,
} from '../artwork-tools/tool-registry';
import type { CreateArtworkJobDto } from './artwork-job.dto';
import { invalidArtwork } from '../artworks/artwork-snapshot';

const asJson = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + canonical(value[k]))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
export function publicJob<
  T extends {
    runToken: string | null;
    childPid: number | null;
    requestHash: string;
  },
>(job: T) {
  const result = { ...job } as Partial<T>;
  delete result.runToken;
  delete result.childPid;
  delete result.requestHash;
  return result as Omit<T, 'runToken' | 'childPid' | 'requestHash'>;
}

@Injectable()
export class ArtworkJobsService {
  constructor(private readonly db: PrismaService) {}
  private async own(projectId: string, ownerId: number) {
    if (
      !(await this.db.artworkProject.findFirst({
        where: { id: projectId, ownerId },
      }))
    )
      throw new NotFoundException();
  }
  registry() {
    return TOOL_REGISTRY;
  }
  async enqueue(projectId: string, ownerId: number, dto: CreateArtworkJobDto) {
    await this.own(projectId, ownerId);
    const definition = validateTool(dto.tool, dto.arguments, dto.inputIds);
    const revision = await this.db.artworkRevision.findFirst({
      where: { id: dto.baseRevisionId, projectId },
    });
    if (!revision) throw new NotFoundException();
    const inputs = await this.db.artworkArtifact.findMany({
      where: { projectId, id: { in: dto.inputIds } },
    });
    if (
      inputs.length !== dto.inputIds.length ||
      dto.inputIds.some(
        (id, i) =>
          !matchesInput(
            definition.inputs[i],
            inputs.find((a) => a.id === id)!.kind,
          ),
      )
    )
      throw invalidArtwork('Invalid tool artifact inputs');
    if (dto.tool === 'segmentObject' && !inputs[0]?.registrationId)
      throw invalidArtwork('Register the source image before segmentation');
    if (inputs.length > 1) {
      const image = inputs.find((a) => a.id === dto.inputIds[0])!,
        mask = inputs.find((a) => a.id === dto.inputIds[1])!;
      const edge = await this.db.artworkArtifactInput.findUnique({
        where: {
          artifactId_inputId: { artifactId: mask.id, inputId: image.id },
        },
      });
      if (
        !edge ||
        !image.registrationId ||
        image.registrationId !== mask.registrationId ||
        image.width !== mask.width ||
        image.height !== mask.height
      )
        throw invalidArtwork(
          'Mask must be registered to exact tool input image',
        );
    }
    const hash = createHash('sha256')
      .update(
        canonical({
          baseRevisionId: dto.baseRevisionId,
          tool: dto.tool,
          arguments: dto.arguments,
          inputIds: dto.inputIds,
        }),
      )
      .digest('hex');
    const job = await this.db.artworkJob.upsert({
      where: {
        projectId_requestKey: { projectId, requestKey: dto.requestKey },
      },
      update: {},
      create: {
        projectId,
        baseRevisionId: dto.baseRevisionId,
        requestKey: dto.requestKey,
        requestHash: hash,
        tool: dto.tool,
        arguments: asJson(dto.arguments),
        inputIds: asJson(dto.inputIds),
      },
    });
    if (job.requestHash !== hash)
      throw new ConflictException({
        code: 'ARTWORK_REQUEST_KEY_REUSED',
        message: 'Request key already belongs to another operation',
      });
    return publicJob(job);
  }
  async get(projectId: string, ownerId: number, id: string) {
    await this.own(projectId, ownerId);
    const job = await this.db.artworkJob.findFirst({
      where: { id, projectId },
    });
    if (!job) throw new NotFoundException();
    return publicJob(job);
  }
  async list(projectId: string, ownerId: number, cursor?: string) {
    await this.own(projectId, ownerId);
    if (
      cursor &&
      !(await this.db.artworkJob.findFirst({
        where: { id: cursor, projectId },
      }))
    )
      throw new NotFoundException();
    return (
      await this.db.artworkJob.findMany({
        where: { projectId },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: 100,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      })
    ).map(publicJob);
  }
  async cancel(projectId: string, ownerId: number, id: string) {
    await this.get(projectId, ownerId, id);
    await this.db.$transaction(async (tx) => {
      await tx.artworkJob.updateMany({
        where: { id, projectId, state: 'queued' },
        data: {
          state: 'cancelled',
          cancelRequested: true,
          phase: 'cancelled',
          finishedAt: new Date(),
        },
      });
      await tx.artworkJob.updateMany({
        where: { id, projectId, state: 'running' },
        data: { cancelRequested: true },
      });
    });
    return this.get(projectId, ownerId, id);
  }
  async retry(projectId: string, ownerId: number, id: string) {
    await this.get(projectId, ownerId, id);
    const changed = await this.db.artworkJob.updateMany({
      where: {
        id,
        projectId,
        state: { in: ['failed', 'cancelled'] },
        attempt: { lt: 3 },
        runToken: null,
        childPid: null,
      },
      data: {
        state: 'queued',
        phase: 'queued',
        progress: 0,
        cancelRequested: false,
        errorCode: null,
        availableAt: new Date(),
        finishedAt: null,
        runToken: null,
        childPid: null,
      },
    });
    if (!changed.count)
      throw new ConflictException({
        code: 'ARTWORK_RETRY_UNAVAILABLE',
        message:
          'Only failed or cancelled jobs below three attempts can be retried',
      });
    return this.get(projectId, ownerId, id);
  }
}
