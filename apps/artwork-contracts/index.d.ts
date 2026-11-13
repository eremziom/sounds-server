/** Creator persistence contract v1. Drafts are not playable ArtworkPackages.
 * The sole runtime contract/parser remains in ui/src/engines/infinite-zoom/artwork/.
 * Kept declaration-only so API and future UI/worker clients share types without
 * importing the renderer or introducing a runtime package dependency.
 */
export interface ArtworkBrief {
  intent: string;
  guidelinesVersion: string;
  guidelinesPath: string;
  composition: string;
  motionPlan: string;
  lightingPlan: string;
  blackoutPlan: string;
  qaPlan: string;
}
export interface ArtworkLayerDraft {
  id: string;
  imageArtifactId: string;
  maskArtifactIds: string[];
  /** Uncompiled authoring choices. Builder must validate against the engine. */
  parameters: Record<string, unknown>;
}
export interface ArtworkRevisionSnapshot {
  schemaVersion: 1;
  brief: ArtworkBrief;
  layers: ArtworkLayerDraft[];
  artifactIds: string[];
  decisions: string[];
}
export interface ArtworkRevisionValidation {
  staleArtifactIds: string[];
  ready: boolean;
}
export interface SaveArtworkRevision {
  baseRevisionId?: string;
  snapshot: ArtworkRevisionSnapshot;
}
/** Reserved publication boundary; KRE-07 implements publication and the library.
 * A published package points to a frozen revision and an immutable runtime
 * manifest. It never embeds conversation messages or requires a running model.
 */
export interface PublishedArtworkReference {
  projectId: string;
  revisionId: string;
  version: string;
  manifestSha256: string;
  manifestUri: string;
}

export type ArtworkToolName = 'generateImage' | 'editImage' | 'segmentObject' |
  'fillBackground' | 'registerImage' | 'extractLayer' | 'refineMask' |
  'deriveLightSelection' | 'buildInfluenceMap' | 'buildDelayMap' |
  'setBehaviors' | 'setTravel' | 'buildPreviewPackage';
export type ArtworkJobState = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export interface ArtworkJobRequest {
  baseRevisionId: string;
  requestKey: string;
  tool: ArtworkToolName;
  arguments: Record<string, unknown>;
  inputIds: string[];
}
export interface ArtworkJobResult {
  outputs: {name: string; artifactId: string}[];
  baseRevisionId: string;
  applied: false;
  details: unknown;
}
export interface ArtworkJobRecord extends ArtworkJobRequest {
  id: string;
  projectId: string;
  state: ArtworkJobState;
  attempt: number;
  progress: number;
  phase: string;
  cancelRequested: boolean;
  errorCode: string | null;
  result: ArtworkJobResult | null;
  memory: unknown;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  availableAt: string;
}
