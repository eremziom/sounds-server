"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import type { ArtworkJobRecord, ArtworkToolName } from "../../../../artwork-contracts/index.d.ts";
import { artifactUrl, type Artifact, type Revision } from "../../api/artworks";
import { Button } from "../ui/button";
import type { SceneAssembly } from "./scene-assembly";

const inputClass = "mt-1 w-full rounded border bg-background p-2 text-sm";
const roles = ["visibility-mask", "occlusion-mask", "material-mask", "influence-map", "delay-map"] as const;
const operations = ["segmentObject", "createMask", "refineMask", "fillBackground", "extractLayer", "deriveLightSelection", "buildInfluenceMap", "buildDelayMap", "registerMap", "createColorPlate"] as const;
const kindKeys = { image: "image", report: "report", "visibility-mask": "visibilityMask", "occlusion-mask": "occlusionMask", "material-mask": "materialMask", "influence-map": "influenceMap", "delay-map": "delayMap" } as const;

export function ProductionControls({ projectId, revision, artifacts, jobs, disabled, onRun, onAssemble, onKeep }: {
  projectId: string; revision: Revision; artifacts: Artifact[]; jobs: ArtworkJobRecord[]; disabled: boolean;
  onRun(tool: ArtworkToolName, args: Record<string, unknown>, inputs: string[]): Promise<void>;
  onAssemble(options: SceneAssembly): Promise<void>; onKeep(id: string): Promise<void>;
}) {
  const t = useTranslations("app.creator.tools");
  const initialImage = revision.snapshot.layers.find(l => l.id === "environment" || l.id === "source")?.imageArtifactId ?? "";
  const [imageId, setImageId] = useState(initialImage), [maskId, setMaskId] = useState("");
  const [operation, setOperation] = useState<typeof operations[number]>("segmentObject");
  const [role, setRole] = useState<typeof roles[number]>("visibility-mask");
  const [points, setPoints] = useState<{ x: number; y: number; label: number }[]>([]), [negative, setNegative] = useState(false);
  const [error, setError] = useState(false);
  const image = artifacts.find(a => a.id === imageId);
  const images = artifacts.filter(a => a.kind === "image" && a.width && a.height && a.width * 9 === a.height * 16);
  const masks = artifacts.filter(a => roles.includes(a.kind as typeof roles[number]) &&
    (operation === "registerMap" || a.inputs.some(i => i.inputId === imageId)));
  const name = (asset: Artifact) => {
    const job = jobs.find(j => j.result?.outputs.some(o => o.artifactId === asset.id));
    const key = kindKeys[asset.kind as keyof typeof kindKeys];
    const kind = key ? t(`kinds.${key}`) : asset.kind;
    const tool = operations.find(tool => tool === job?.tool);
    return `${tool ? t(`actions.${tool}`) : job?.tool === "generateImage" ? t("actions.generateImage") : kind} · ${asset.id.slice(0, 8)}`;
  };
  async function run(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(false);
    const data = new FormData(event.currentTarget), number = (key: string) => Number(data.get(key));
    let args: Record<string, unknown>, inputs: string[] = [];
    switch (operation) {
      case "segmentObject": args = { points, role }; inputs = [imageId]; break;
      case "createMask": args = { value: 255, role }; inputs = [imageId]; break;
      case "refineMask": args = { operation: "dilate", radius: number("radius"), role }; inputs = [imageId, maskId]; break;
      case "fillBackground": args = { dilation: number("radius") }; inputs = [imageId, maskId]; break;
      case "extractLayer": args = {}; inputs = [imageId, maskId]; break;
      case "deriveLightSelection": args = { minLuma: number("luma"), minSaturation: number("saturation"), detailRadius: 3, detailContrast: number("contrast") }; inputs = [imageId, maskId]; break;
      case "buildInfluenceMap": args = { feather: 1 }; inputs = [imageId, maskId]; break;
      case "buildDelayMap": args = { direction: String(data.get("direction")) }; inputs = [imageId, maskId]; break;
      case "registerMap": args = { role }; inputs = [imageId, maskId]; break;
      case "createColorPlate": args = { width: 16, height: 9, rgb: [0, 0, 0] }; break;
    }
    await onRun(operation, args, inputs);
  }
  async function assemble(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(false);
    const data = new FormData(event.currentTarget), get = (key: string) => String(data.get(key) ?? "");
    try {
      await onAssemble({ coverage: get("coverage"), environment: get("environment"), object: get("object"), material: get("material"), influence: get("influence"), delay: get("delay"), occlusion: get("occlusion"),
        duration: Number(get("duration")), distance: Number(get("distance")), bend: Number(get("bend")), period: Number(get("period")), audio: data.has("audio") });
    } catch { setError(true); }
  }
  return <details data-creator-production className="rounded border p-3">
    <summary className="cursor-pointer font-semibold">{t("title")}</summary>
    <p className="my-3 text-sm text-muted-foreground">{t("help")}</p>
    {error && <p role="alert">{t("error")}</p>}
    <fieldset disabled={disabled} className="space-y-4">
      <form onSubmit={run} className="space-y-3" data-production-tool>
        <label className="block text-sm">{t("operation")}<select name="operation" className={inputClass} value={operation} onChange={e => setOperation(e.target.value as typeof operation)}>
          {operations.map(tool => <option key={tool} value={tool}>{t(`actions.${tool}`)}</option>)}
        </select></label>
        {operation !== "createColorPlate" && <>
          <label className="block text-sm">{t("image")}<select name="image" required className={inputClass} value={imageId} onChange={e => { setImageId(e.target.value); setMaskId(""); setPoints([]); }}>
            <option value="">{t("choose")}</option>{images.map(a => <option key={a.id} value={a.id}>{name(a)}</option>)}
          </select></label>
          {image && <button type="button" className="relative block w-full overflow-hidden rounded bg-black" aria-label={t("pointHelp")} onClick={event => {
            if (operation !== "segmentObject" || points.length >= 32) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            const x = Math.max(0, Math.min(image.width! - 1, (event.clientX - bounds.left) * image.width! / bounds.width));
            const y = Math.max(0, Math.min(image.height! - 1, (event.clientY - bounds.top) * image.height! / bounds.height));
            setPoints([...points, { x, y, label: negative ? 0 : 1 }]);
          }}>
            <img /* eslint-disable-line @next/next/no-img-element -- Authenticated private source, exact image coordinates. */
              src={artifactUrl(projectId, image.id)} alt={t("image")} className="block h-auto w-full" draggable={false} />
            {points.map((point, index) => <span key={index} className={`pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white ${point.label ? "bg-green-600" : "bg-red-600"}`} style={{ left: `${point.x / image.width! * 100}%`, top: `${point.y / image.height! * 100}%` }} />)}
          </button>}
        </>}
        {operation === "segmentObject" && <>
          <p className="text-xs">{t("pointHelp")}</p>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={negative} onChange={e => setNegative(e.target.checked)} />{t("negativePoint")}</label>
          <Button type="button" variant="outline" onClick={() => setPoints([])}>{t("clearPoints")}</Button>
          <output className="ml-3 text-sm">{t("points", { count: points.length })}</output>
        </>}
        {["segmentObject", "createMask", "refineMask", "registerMap"].includes(operation) && <label className="block text-sm">{t("role")}<select name="role" className={inputClass} value={role} onChange={e => setRole(e.target.value as typeof role)}>
          {roles.map(kind => <option key={kind} value={kind}>{t(`kinds.${kindKeys[kind]}`)}</option>)}
        </select></label>}
        {!["segmentObject", "createMask", "createColorPlate"].includes(operation) && <label className="block text-sm">{t("mask")}<select name="mask" required className={inputClass} value={maskId} onChange={e => setMaskId(e.target.value)}>
          <option value="">{t("choose")}</option>{masks.map(a => <option key={a.id} value={a.id}>{name(a)}</option>)}
        </select></label>}
        {["fillBackground", "refineMask"].includes(operation) && <label className="block text-sm">{t("radius")}<input name="radius" type="number" required min={0} max={50} step={1} defaultValue={10} className={inputClass} /></label>}
        {operation === "deriveLightSelection" && <div className="grid grid-cols-3 gap-2">
          <label className="text-sm">{t("luma")}<input name="luma" type="number" required min={0} max={255} defaultValue={70} className={inputClass} /></label>
          <label className="text-sm">{t("saturation")}<input name="saturation" type="number" required min={0} max={1} step={0.01} defaultValue={0.08} className={inputClass} /></label>
          <label className="text-sm">{t("contrast")}<input name="contrast" type="number" required min={1} max={64} defaultValue={8} className={inputClass} /></label>
        </div>}
        {operation === "buildDelayMap" && <label className="block text-sm">{t("direction")}<select name="direction" className={inputClass}><option value="x">{t("horizontal")}</option><option value="y">{t("vertical")}</option></select></label>}
        {operation === "registerMap" && <p className="text-xs">{t("registrationHelp")}</p>}
        <Button type="submit" disabled={operation === "segmentObject" && (!points.length || !image?.registrationId)}>{t("run")}</Button>
      </form>
      <form onSubmit={assemble} className="space-y-3 border-t pt-3" data-production-assembly>
        <h4 className="font-semibold">{t("assembly")}</h4><p className="text-xs">{t("assemblyHelp")}</p>
        {(["coverage", "environment", "object", "material", "influence", "delay", "occlusion"] as const).map(field => {
          const kind = { coverage: "image", environment: "image", object: "image", material: "material-mask", influence: "influence-map", delay: "delay-map", occlusion: "occlusion-mask" }[field];
          return <label key={field} className="block text-sm">{t(`assemblyFields.${field}`)}<select name={field} required={field !== "occlusion"} className={inputClass}>
            <option value="">{t("choose")}</option>{artifacts.filter(a => a.kind === kind).map(a => <option key={a.id} value={a.id}>{name(a)}</option>)}
          </select></label>;
        })}
        {([ ["duration", 24, 1, 120], ["distance", 2800, -3840, 3840], ["bend", -400, -2160, 2160], ["period", 8, 1, 60] ] as const).map(([field, value, min, max]) => <label key={field} className="block text-sm">{t(`assemblyFields.${field}`)}<input className={inputClass} required name={field} type="number" min={min} max={max} step={1} defaultValue={value} /></label>)}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="audio" defaultChecked />{t("audio")}</label>
        <Button type="submit">{t("saveAssembly")}</Button>
      </form>
      <div className="space-y-2 border-t pt-3"><h4 className="font-semibold">{t("results")}</h4>
        {jobs.filter(job => job.state === "succeeded" && job.tool !== "buildPreviewPackage").flatMap(job => job.result?.outputs ?? []).map(output => {
          const artifact = artifacts.find(a => a.id === output.artifactId);
          return artifact && <div key={artifact.id} className="flex items-center justify-between gap-2 text-sm"><span>{name(artifact)}</span>
            <Button type="button" variant="outline" disabled={revision.snapshot.artifactIds.includes(artifact.id)} onClick={() => void onKeep(artifact.id)}>{t("keep")}</Button></div>;
        })}
      </div>
    </fieldset>
  </details>;
}
