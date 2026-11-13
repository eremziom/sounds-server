import { validateSnapshot } from './artwork-snapshot';
import type { ArtifactNode } from './artwork-snapshot';
import type { RevisionSnapshotDto } from './artwork.dto';

const image: ArtifactNode = {
  id: 'image-a',
  kind: 'image',
  width: 100,
  height: 50,
  registrationId: 'registration',
  inputs: [],
};
const mask: ArtifactNode = {
  ...image,
  id: 'mask-a',
  kind: 'material-mask',
  inputs: [{ inputId: image.id }],
};
const delay: ArtifactNode = {
  ...mask,
  id: 'delay',
  kind: 'delay-map',
  inputs: [{ inputId: mask.id }],
};
const snapshot = (
  artifactIds: string[],
  layers: RevisionSnapshotDto['layers'] = [],
): RevisionSnapshotDto => ({
  schemaVersion: 1,
  brief: {} as RevisionSnapshotDto['brief'],
  artifactIds,
  layers,
  decisions: [],
});

describe('revision dependency validation', () => {
  it('propagates stale state transitively without mutating older snapshots', () => {
    const original = snapshot(['image-a', 'mask-a', 'delay']);
    expect(validateSnapshot(original, [image, mask, delay])).toEqual({
      ready: true,
      staleArtifactIds: [],
    });
    expect(
      validateSnapshot(snapshot(['mask-a', 'delay']), [image, mask, delay]),
    ).toEqual({ ready: false, staleArtifactIds: ['delay', 'mask-a'] });
    expect(validateSnapshot(original, [image, mask, delay]).ready).toBe(true);
  });
  it('rejects a mask from another image even when registration/dimensions match', () => {
    const other = { ...image, id: 'image-b' };
    const draft = snapshot(
      ['image-b', 'mask-a'],
      [
        {
          id: 'ship',
          imageArtifactId: other.id,
          maskArtifactIds: [mask.id],
          parameters: {},
        },
      ],
    );
    expect(() => validateSnapshot(draft, [image, other, mask])).toThrow(
      'exact image',
    );
  });
  it('rejects unknown artifacts and duplicate layer ids', () => {
    expect(() => validateSnapshot(snapshot(['unknown']), [image])).toThrow(
      'Unknown',
    );
    const layer = {
      id: 'ship',
      imageArtifactId: image.id,
      maskArtifactIds: [],
      parameters: {},
    };
    expect(() =>
      validateSnapshot(snapshot([image.id], [layer, layer]), [image]),
    ).toThrow('unique');
  });
});
