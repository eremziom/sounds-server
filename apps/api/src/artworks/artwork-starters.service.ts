import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { ArtworksService } from './artworks.service';
import { ArtworkJobsService } from '../artwork-jobs/artwork-jobs.service';
import type { ArtifactMetadataDto, RevisionSnapshotDto } from './artwork.dto';
import { invalidArtwork, validateSnapshot } from './artwork-snapshot';

interface Starter {
  version: number;
  title: string;
  snapshot: RevisionSnapshotDto;
  sourcePackageSha256: string;
  previewControls: { environmentLayerIds: string[]; lightLayerIds: string[] };
  artifacts: {
    id: string;
    kind: string;
    file: string;
    sha256: string;
    width: number;
    height: number;
    registrationId: string;
    inputIds: string[];
  }[];
}

/** A private editable copy of shipped, immutable pilot assets. No model inference or publication. */
@Injectable()
export class ArtworkStartersService {
  constructor(
    private readonly artworks: ArtworksService,
    private readonly jobs: ArtworkJobsService,
    private readonly config: ConfigService,
  ) {}

  async nightGarden(ownerId: number) {
    const repo = resolve(
      this.config.get<string>('ARTWORK_REPO_ROOT') ??
        join(__dirname, '../../../../..'),
    );
    const directory = join(
      repo,
      'apps/api/resources/artwork-starters/night-garden',
    );
    const definition = JSON.parse(
      await readFile(join(directory, 'definition.json'), 'utf8'),
    ) as Starter;
    if (definition.version !== 1 || definition.artifacts.length > 100)
      throw invalidArtwork('Invalid starter');
    // Verify all files before creating a project; a damaged installation must not start a partial import.
    const files = new Map<string, Buffer>();
    for (const asset of definition.artifacts) {
      if (!/^[a-f0-9-]{36}\.png$/.test(asset.file))
        throw invalidArtwork('Invalid starter filename');
      const bytes = await readFile(join(directory, asset.file));
      if (createHash('sha256').update(bytes).digest('hex') !== asset.sha256)
        throw invalidArtwork('Starter checksum mismatch');
      files.set(asset.id, bytes);
    }
    validateSnapshot(
      definition.snapshot,
      definition.artifacts.map((a) => ({
        ...a,
        inputs: a.inputIds.map((inputId) => ({ inputId })),
      })),
    );
    const project = await this.artworks.create(ownerId, definition.title);
    const ids = new Map<string, string>(),
      registrations = new Map<string, string>();
    const pending = [...definition.artifacts];
    while (pending.length) {
      const index = pending.findIndex((a) =>
        a.inputIds.every((id) => ids.has(id)),
      );
      if (index < 0) throw invalidArtwork('Starter dependency cycle');
      const [asset] = pending.splice(index, 1);
      if (!registrations.has(asset.registrationId))
        registrations.set(asset.registrationId, randomUUID());
      const meta: ArtifactMetadataDto = {
        kind: asset.kind,
        width: asset.width,
        height: asset.height,
        inputIds: asset.inputIds.map((id) => ids.get(id)!),
        registrationId: registrations.get(asset.registrationId),
        provenance: {
          source: 'KRE-03 night-garden starter',
          originalArtifactId: asset.id,
          originalSha256: asset.sha256,
          sourcePackageSha256: definition.sourcePackageSha256,
          guidelinesVersion: definition.snapshot.brief.guidelinesVersion,
          visualAcceptance: false,
        },
      };
      const artifact = await this.artworks.upload(
        project.id,
        ownerId,
        meta,
        files.get(asset.id)!,
      );
      ids.set(asset.id, artifact.id);
    }
    const remap = (value: unknown): unknown =>
      typeof value === 'string'
        ? (ids.get(value) ?? value)
        : Array.isArray(value)
          ? value.map(remap)
          : value && typeof value === 'object'
            ? Object.fromEntries(
                Object.entries(value).map(([key, child]) => [
                  key,
                  remap(child),
                ]),
              )
            : value;
    const snapshot = remap(definition.snapshot) as RevisionSnapshotDto;
    const revision = await this.artworks.save(project.id, ownerId, {
      snapshot,
    });
    await this.artworks.message(
      project.id,
      ownerId,
      'Kopia technicznego pilota KRE-03. Cienkie elementy drona i ziarniste granice mchu/kamienia wymagają oceny. Projekt nie jest opublikowaną ani odebraną artystycznie sceną.',
    );
    await this.jobs.enqueue(project.id, ownerId, {
      baseRevisionId: revision.id,
      requestKey: `starter-preview-${revision.id}`,
      tool: 'buildPreviewPackage',
      arguments: definition.previewControls,
      inputIds: [],
    });
    return this.artworks.get(project.id, ownerId);
  }
}
