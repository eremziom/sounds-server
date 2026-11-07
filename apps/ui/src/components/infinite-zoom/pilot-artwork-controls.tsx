"use client";

import { useTranslations } from "next-intl";
import { Button } from "../ui/button";
import { useInfiniteZoom, useVisualSnapshot } from "./infinite-zoom-provider";
import type {BehaviorKind,VisualScene} from "../../engines/infinite-zoom/artwork/pilot-controls";

export function PilotArtworkControls() {
  const runtime=useInfiniteZoom(), snapshot=useVisualSnapshot(), t=useTranslations("app.infiniteZoom");
  const scenePrefix=snapshot.scene === "alien" ? "alien" : snapshot.scene === "clockwork" ? "clockwork" : snapshot.scene === "layered" ? "layered" : "pilot";
  function behaviorLabel(kind:BehaviorKind){
    if(scenePrefix === "alien" && (kind === "scale" || kind === "wave" || kind === "flow" || kind === "bend" || kind === "opacity" || kind === "colorShift" || kind === "pulse" || kind === "glow"))return t(`alienBehaviors.${kind}`);
    if(scenePrefix === "clockwork" && (kind === "rotate" || kind === "pulse" || kind === "glow"))return t(`clockworkBehaviors.${kind}`);
    return t(`${scenePrefix === "layered" ? "layeredBehaviors" : "pilotBehaviors"}.${kind}`);
  }
  return <div className="space-y-4">
    <label className="flex flex-wrap items-center gap-3 text-sm font-medium">
      {t("sceneLabel")}
      <select data-iz-scene className="rounded-md border bg-background px-3 py-2" value={snapshot.scene ?? "journey"}
        disabled={!snapshot.ready || snapshot.sceneLoading} onChange={event=>void runtime.selectScene(event.target.value as VisualScene).catch(()=>{})}>
        <option value="journey">{t("journeyScene")}</option><option value="alien">{t("alienScene")}</option><option value="clockwork">{t("clockworkScene")}</option><option value="layered">{t("layeredScene")}</option><option value="pilot">{t("pilotScene")}</option>
      </select>
      {snapshot.sceneLoading && <span role="status" className="font-normal text-muted-foreground">{t("sceneLoading")}</span>}
    </label>
    {snapshot.scene && snapshot.scene !== "journey" && <fieldset disabled={snapshot.sceneLoading} data-iz-pilot className="space-y-4 rounded-lg border p-4">
      <legend className="px-2 text-sm font-semibold">{t("pilotHeading")}</legend>
      <p className="text-sm text-muted-foreground">{t(`${scenePrefix}Description`)}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" data-iz-preset="subtle" onClick={()=>runtime.setPilotPreset("subtle")}>{t("subtlePreset")}</Button>
        <Button type="button" variant="outline" data-iz-preset="all" onClick={()=>runtime.setPilotPreset("all")}>{t("enableAll")}</Button>
        <Button type="button" variant="outline" data-iz-preset="none" onClick={()=>runtime.setPilotPreset("none")}>{t("disableAll")}</Button>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" data-iz-pilot-camera checked={!!snapshot.pilotCameraMotion}
        onChange={event=>runtime.setPilotCameraMotion(event.target.checked)}/>{t(snapshot.scene === "clockwork" ? "clockworkCamera" : "pilotCamera")}</label>
      <div className="grid gap-3 md:grid-cols-2">
        {snapshot.pilotControls?.map(control=><div key={control.kind} className="space-y-2 rounded-md border p-3" data-iz-behavior={control.kind}>
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" data-iz-behavior-enabled checked={control.enabled}
              onChange={event=>runtime.setPilotControl(control.kind,event.target.checked,control.strength)}/>{behaviorLabel(control.kind)}</label>
            <Button type="button" size="sm" variant="outline" data-iz-solo onClick={()=>runtime.setPilotPreset(control.kind)}>{t("soloBehavior")}</Button>
          </div>
          <label className="flex items-center gap-3 text-xs text-muted-foreground">{t("behaviorStrength")}
            <input className="min-w-0 flex-1" data-iz-behavior-strength type="range" min="0" max="1" step="0.05" value={control.strength}
              onChange={event=>runtime.setPilotControl(control.kind,control.enabled,Number(event.target.value))}/>
            <output className="w-9 text-right">{Math.round(control.strength*100)}%</output>
          </label>
        </div>)}
      </div>
      <p className="text-xs text-muted-foreground">{t(`${scenePrefix}Notes`)}</p>
    </fieldset>}
  </div>;
}
