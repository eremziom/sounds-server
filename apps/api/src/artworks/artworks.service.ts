import {
  ConflictException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client.cjs';
import { ArtworkStorageService } from './artwork-storage.service';
import { invalidArtwork, validateSnapshot } from './artwork-snapshot';
import type {
  ArtifactMetadataDto,
  CreateRevisionDto,
  RevisionSnapshotDto,
} from './artwork.dto';

const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const artifactSelect = {
  id: true,
  projectId: true,
  kind: true,
  mimeType: true,
  sizeBytes: true,
  sha256: true,
  width: true,
  height: true,
  registrationId: true,
  provenance: true,
  createdAt: true,
  inputs: { select: { inputId: true } },
} as const;
const conflict = () =>
  new ConflictException({
    code: 'ARTWORK_REVISION_CONFLICT',
    message: 'Project changed; reload its active revision',
  });

@Injectable()
export class ArtworksService {
  constructor(
    private readonly db: PrismaService,
    private readonly storage: ArtworkStorageService,
  ) {}

  private async owned(projectId: string, ownerId: number) {
    const project = await this.db.artworkProject.findFirst({
      where: { id: projectId, ownerId },
    });
    if (!project) throw new NotFoundException();
    return project;
  }

  create(ownerId: number, title: string) {
    if (!title.trim()) throw invalidArtwork('Title is required');
    return this.db.artworkProject.create({
      data: { ownerId, title: title.trim() },
    });
  }
  async list(ownerId: number, cursor?: string) {
    if (cursor) await this.owned(cursor, ownerId);
    return this.db.artworkProject.findMany({
      where: { ownerId },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      take: 100,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
  }
  async get(projectId: string, ownerId: number) {
    const project = await this.owned(projectId, ownerId);
    const revision = project.activeRevisionId
      ? await this.revision(projectId, ownerId, project.activeRevisionId)
      : null;
    return { ...project, revision };
  }
  async history(projectId: string, ownerId: number, cursor?: string) {
    await this.owned(projectId, ownerId);
    if (
      cursor &&
      !(await this.db.artworkRevision.findFirst({
        where: { id: cursor, projectId },
      }))
    )
      throw new NotFoundException();
    return this.db.artworkRevision.findMany({
      where: { projectId },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: 100,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        parentId: true,
        restoredFromId: true,
        createdAt: true,
      },
    });
  }
  private nodes(projectId: string) {
    return this.db.artworkArtifact.findMany({
      where: { projectId },
      select: artifactSelect,
    });
  }
  async revision(projectId: string, ownerId: number, id: string) {
    await this.owned(projectId, ownerId);
    const revision = await this.db.artworkRevision.findFirst({
      where: { id, projectId },
    });
    if (!revision) throw new NotFoundException();
    return {
      ...revision,
      validation: validateSnapshot(
        revision.snapshot as unknown as RevisionSnapshotDto,
        await this.nodes(projectId),
      ),
    };
  }
  async save(
    projectId: string,
    ownerId: number,
    dto: CreateRevisionDto,
    restoredFromId?: string,
  ) {
    const project = await this.owned(projectId, ownerId);
    if (project.activeRevisionId !== (dto.baseRevisionId ?? null))
      throw conflict();
    if (JSON.stringify(dto.snapshot).length > 200000)
      throw invalidArtwork('Snapshot too large');
    const validation = validateSnapshot(
      dto.snapshot,
      await this.nodes(projectId),
    );
    return this.db.$transaction(async (tx) => {
      // Compare-and-swap locks the project before creating a revision. Failure rolls back both.
      const locked = await tx.artworkProject.updateMany({
        where: {
          id: projectId,
          ownerId,
          activeRevisionId: dto.baseRevisionId ?? null,
        },
        data: { updatedAt: new Date() },
      });
      if (locked.count !== 1) throw conflict();
      const revision = await tx.artworkRevision.create({
        data: {
          projectId,
          parentId: dto.baseRevisionId ?? null,
          restoredFromId,
          snapshot: json(dto.snapshot),
        },
      });
      await tx.artworkProject.update({
        where: { id: projectId },
        data: { activeRevisionId: revision.id },
      });
      return { ...revision, validation };
    });
  }
  async restore(
    projectId: string,
    ownerId: number,
    baseRevisionId: string,
    revisionId: string,
  ) {
    const old = await this.revision(projectId, ownerId, revisionId);
    return this.save(
      projectId,
      ownerId,
      {
        baseRevisionId,
        snapshot: old.snapshot as unknown as RevisionSnapshotDto,
      },
      old.id,
    );
  }
  async artifacts(projectId: string, ownerId: number) {
    await this.owned(projectId, ownerId);
    return this.nodes(projectId);
  }

  async upload(
    projectId: string,
    ownerId: number,
    meta: ArtifactMetadataDto,
    bytes: Buffer,
  ) {
    await this.owned(projectId, ownerId);
    if (JSON.stringify(meta.provenance).length > 16000)
      throw invalidArtwork('Provenance too large');
    const inputs = await this.db.artworkArtifact.findMany({
      where: { projectId, id: { in: meta.inputIds } },
    });
    if (inputs.length !== meta.inputIds.length)
      throw invalidArtwork('Inputs must belong to this project');
    const stored = await this.storage.write(bytes, meta.kind);
    try {
      if (
        (meta.width !== undefined && meta.width !== stored.width) ||
        (meta.height !== undefined && meta.height !== stored.height)
      )
        throw invalidArtwork('Declared dimensions differ from file');
      if (
        meta.kind !== 'image' &&
        meta.kind !== 'report' &&
        (!meta.registrationId ||
          !inputs.some(
            (i) =>
              i.kind === 'image' &&
              i.registrationId === meta.registrationId &&
              i.width === stored.width &&
              i.height === stored.height,
          ))
      )
        throw invalidArtwork(
          'Maps require a registered input image of the same dimensions',
        );
      const artifact = await this.db.$transaction(async (tx) => {
        const created = await tx.artworkArtifact.create({
          data: {
            ...stored,
            projectId,
            kind: meta.kind,
            registrationId: meta.registrationId,
            provenance: json(meta.provenance),
          },
        });
        if (meta.inputIds.length)
          await tx.artworkArtifactInput.createMany({
            data: meta.inputIds.map((inputId) => ({
              artifactId: created.id,
              inputId,
              projectId,
            })),
          });
        return tx.artworkArtifact.findUniqueOrThrow({
          where: { id: created.id },
          select: artifactSelect,
        });
      });
      return artifact;
    } catch (error) {
      await this.storage.discard(stored.storageKey);
      throw error;
    }
  }
  async file(projectId: string, ownerId: number, id: string) {
    await this.owned(projectId, ownerId);
    const artifact = await this.db.artworkArtifact.findFirst({
      where: { id, projectId },
    });
    if (!artifact) throw new NotFoundException();
    return new StreamableFile(await this.storage.read(artifact.storageKey), {
      type: artifact.mimeType,
      disposition: `attachment; filename="${artifact.id}.${artifact.mimeType === 'image/png' ? 'png' : 'json'}"`,
      length: artifact.sizeBytes,
    });
  }
  async messages(projectId: string, ownerId: number, cursor?: string) {
    await this.owned(projectId, ownerId);
    if (
      cursor &&
      !(await this.db.creatorMessage.findFirst({
        where: { id: cursor, projectId },
      }))
    )
      throw new NotFoundException();
    return this.db.creatorMessage.findMany({
      where: { projectId },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: 100,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
  }
  async message(projectId: string, ownerId: number, text: string) {
    await this.owned(projectId, ownerId);
    return this.db.creatorMessage.create({
      data: { projectId, role: 'user', text },
    });
  }
}
