import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { ArtworkStartersService } from './artwork-starters.service';
import { validateSnapshot, type ArtifactNode } from './artwork-snapshot';
import type { ArtworksService } from './artworks.service';
import type { ArtworkJobsService } from '../artwork-jobs/artwork-jobs.service';
import type { ArtifactMetadataDto, CreateRevisionDto } from './artwork.dto';
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));

describe('private artwork starter', () => {
  function fixture() {
    const projectId = randomUUID(),
      nodes: ArtifactNode[] = [];
    const artworks = {
      create: jest.fn().mockResolvedValue({ id: projectId }),
      upload: jest.fn(
        (
          id: string,
          owner: number,
          meta: ArtifactMetadataDto,
          bytes: Buffer,
        ) => {
          expect(id).toBe(projectId);
          expect(owner).toBe(42);
          expect(bytes.length).toBeGreaterThan(20);
          const artifactId = randomUUID();
          nodes.push({
            id: artifactId,
            kind: meta.kind,
            width: meta.width!,
            height: meta.height!,
            registrationId: meta.registrationId!,
            inputs: meta.inputIds.map((inputId) => ({ inputId })),
          });
          expect(meta.provenance.source).toBe('KRE-03 night-garden starter');
          return Promise.resolve({ id: artifactId });
        },
      ),
      save: jest.fn((id: string, owner: number, dto: CreateRevisionDto) => {
        expect(validateSnapshot(dto.snapshot, nodes).ready).toBe(true);
        expect(dto.snapshot.layers).toHaveLength(7);
        expect(dto.snapshot.artifactIds).toHaveLength(17);
        return Promise.resolve({ id: randomUUID(), snapshot: dto.snapshot });
      }),
      message: jest.fn(),
      get: jest.fn().mockResolvedValue({ id: projectId }),
    };
    const jobs = { enqueue: jest.fn() };
    const service = new ArtworkStartersService(
      artworks as unknown as ArtworksService,
      jobs as unknown as ArtworkJobsService,
      new ConfigService({
        ARTWORK_REPO_ROOT: resolve(__dirname, '../../../..'),
      }),
    );
    return { service, artworks, jobs, projectId };
  }
  it('copies checksummed pixels to the requesting owner and preserves exact map registration', async () => {
    const f = fixture();
    await expect(f.service.nightGarden(42)).resolves.toEqual({
      id: f.projectId,
    });
    expect(f.artworks.upload).toHaveBeenCalledTimes(17);
    expect(f.artworks.create).toHaveBeenCalledWith(
      42,
      expect.stringContaining('KRE-03'),
    );
    expect(f.jobs.enqueue).toHaveBeenCalledWith(
      f.projectId,
      42,
      expect.objectContaining({
        tool: 'buildPreviewPackage',
        inputIds: [],
        arguments: expect.objectContaining({
          environmentLayerIds: ['environment', 'drone'],
        }) as unknown,
      }),
    );
    expect(f.artworks.message).toHaveBeenCalledTimes(1);
  });
  it('never claims a partial import is a saved scene or starts a preview job after a storage error', async () => {
    const f = fixture();
    f.artworks.upload.mockRejectedValueOnce(new Error('Disk failure'));
    await expect(f.service.nightGarden(42)).rejects.toThrow('Disk failure');
    expect(f.artworks.save).not.toHaveBeenCalled();
    expect(f.jobs.enqueue).not.toHaveBeenCalled();
  });
});
