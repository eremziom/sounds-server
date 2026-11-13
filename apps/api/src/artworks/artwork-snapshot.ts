import { BadRequestException } from '@nestjs/common';
import type { RevisionSnapshotDto } from './artwork.dto';

export interface ArtifactNode {
  id: string;
  kind: string;
  width: number | null;
  height: number | null;
  registrationId: string | null;
  inputs: { inputId: string }[];
}

export const invalidArtwork = (message: string) =>
  new BadRequestException({ code: 'ARTWORK_INVALID', message });

/** Validity belongs to the snapshot, never to a globally mutable artifact flag. */
export function validateSnapshot(
  snapshot: RevisionSnapshotDto,
  artifacts: ArtifactNode[],
) {
  if (
    !snapshot ||
    snapshot.schemaVersion !== 1 ||
    !snapshot.brief ||
    !Array.isArray(snapshot.layers) ||
    !Array.isArray(snapshot.artifactIds)
  )
    throw invalidArtwork('Invalid revision snapshot');
  const selected = new Set(snapshot.artifactIds);
  const nodes = new Map(artifacts.map((a) => [a.id, a]));
  if (
    selected.size !== snapshot.artifactIds.length ||
    [...selected].some((id) => !nodes.has(id))
  )
    throw invalidArtwork('Unknown or duplicate artifact');
  const stale = new Set<string>();
  for (const id of selected)
    if (nodes.get(id)!.inputs.some((i) => !selected.has(i.inputId)))
      stale.add(id);
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of selected)
      if (
        !stale.has(id) &&
        nodes.get(id)!.inputs.some((i) => stale.has(i.inputId))
      ) {
        stale.add(id);
        changed = true;
      }
  }
  const layerIds = new Set<string>();
  for (const layer of snapshot.layers) {
    const image = nodes.get(layer.imageArtifactId);
    if (
      layerIds.has(layer.id) ||
      !selected.has(layer.imageArtifactId) ||
      image?.kind !== 'image'
    )
      throw invalidArtwork(
        'Layer must reference a selected image and have a unique id',
      );
    layerIds.add(layer.id);
    for (const id of layer.maskArtifactIds) {
      const mask = nodes.get(id);
      if (
        !selected.has(id) ||
        !mask ||
        ![
          'visibility-mask',
          'occlusion-mask',
          'material-mask',
          'influence-map',
          'delay-map',
        ].includes(mask.kind) ||
        !mask.inputs.some((i) => i.inputId === image.id) ||
        !mask.registrationId ||
        mask.registrationId !== image.registrationId ||
        mask.width !== image.width ||
        mask.height !== image.height
      )
        throw invalidArtwork('Mask must be registered to this exact image');
    }
  }
  return { staleArtifactIds: [...stale].sort(), ready: stale.size === 0 };
}
