import type { ArtworkJobRecord } from "../../../../artwork-contracts/index.d.ts";
import type { Artifact, Revision } from "../../api/artworks.ts";
import { parseArtworkPackage, type ArtworkPackage } from "../../engines/infinite-zoom/artwork/artwork-package.ts";
import { assetTextureBytes } from "../../engines/infinite-zoom/resources/texture-budget.ts";
import type { DraftEnvironmentGroups } from "../infinite-zoom/draft-environment.ts";

export function previewEnvironmentGroups(input: unknown, manifest: ArtworkPackage): DraftEnvironmentGroups {
  const data = input as { previewControls?: DraftEnvironmentGroups };
  const groups = data?.previewControls ?? { environmentLayerIds: [], lightLayerIds: [] };
  if (!Array.isArray(groups.environmentLayerIds) || !Array.isArray(groups.lightLayerIds)) throw Error("Invalid preview controls");
  for (const id of [...groups.environmentLayerIds, ...groups.lightLayerIds]) if (id === manifest.coverage.baseLayerId || !manifest.layers.some(l => l.id === id)) throw Error("Invalid preview layer");
  if (groups.environmentLayerIds.some(id => groups.lightLayerIds.includes(id))) throw Error("Overlapping preview groups");
  return { environmentLayerIds: [...groups.environmentLayerIds], lightLayerIds: [...groups.lightLayerIds] };
}

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`;
  return JSON.stringify(value);
}
export function previewReportId(job: ArtworkJobRecord, revision: Revision): string | null {
  if (job.tool !== "buildPreviewPackage" || job.state !== "succeeded" || job.baseRevisionId !== revision.id ||
    job.result?.baseRevisionId !== revision.id) return null;
  return job.result.outputs.find(output => output.name === "package")?.artifactId ?? null;
}

/** Authenticate the envelope against the selected immutable job/revision/artifacts.
 * URI rewriting stays inside the existing /infinite-zoom policy; the engine parser is unchanged. */
export function prepareDraftManifest(input: unknown, projectId: string, revision: Revision, job: ArtworkJobRecord,
  artifacts: readonly Artifact[]): ArtworkPackage {
  const fail = (): never => { throw new Error("Invalid or outdated preview package"); };
  const reportId = previewReportId(job, revision);
  if (!uuid.test(projectId) || !uuid.test(job.id) || job.projectId !== projectId || !revision.validation.ready || !reportId ||
    !artifacts.some(a => a.id === reportId && a.kind === "report" && a.mimeType === "application/json")) fail();
  if (!input || typeof input !== "object" || Array.isArray(input)) return fail();
  const data = input as Record<string, unknown>;
  if (data.published !== false || data.visualAcceptance !== false || canonical(data.snapshotCandidate) !== canonical(revision.snapshot)) fail();
  const manifest = parseArtworkPackage(data.manifest);
  if (manifest.portal || manifest.id !== `project-${projectId}` || manifest.version !== `job-${job.id}` || manifest.assets.length > 500 ||
    manifest.assets.reduce((sum, asset) => sum + assetTextureBytes(asset), 0) > 192 * 1024 * 1024) fail();
  if (!Array.isArray(data.assetBindings) || data.assetBindings.length !== manifest.assets.length) return fail();
  const bindings = data.assetBindings as { artifactId: string; uri: string }[];
  const ids = new Set<string>();
  const selected = new Set(revision.snapshot.artifactIds);
  const rewritten = manifest.assets.map(asset => {
    const binding = bindings.find(item => item?.artifactId === asset.id);
    const artifact = artifacts.find(item => item.id === asset.id);
    const kind = artifact?.kind === "image" ? "image" : artifact?.kind === "depth" ? "depth" : artifact?.kind === "flow" ? "flow" :
      artifact && ["visibility-mask", "occlusion-mask", "material-mask", "influence-map", "delay-map"].includes(artifact.kind) ? "mask" : null;
    const expected = `/infinite-zoom/jobs/${job.id}/${asset.id}.png`;
    if (!uuid.test(asset.id) || !binding || binding.uri !== asset.uri || asset.uri !== expected || ids.has(binding.artifactId) ||
      !selected.has(asset.id) || !artifact || artifact.mimeType !== "image/png" || artifact.width !== asset.width || artifact.height !== asset.height || kind !== asset.kind) fail();
    ids.add(asset.id);
    return { ...asset, uri: `/infinite-zoom/drafts/${projectId}/${asset.id}.png` };
  });
  // The parser's returned model has defaults; preserve only supported manifest fields.
  return parseArtworkPackage({ ...manifest, assets: rewritten });
}
