import type { ArtworkInstance } from "../../engines/infinite-zoom/artwork/artwork-instance.ts";
export interface DraftEnvironmentGroups { environmentLayerIds: readonly string[]; lightLayerIds: readonly string[] }
/** Preview presentation only. Reveal advances exclusively from the existing 1/60 s steps. */
export function createDraftEnvironment() {
  let instanceId = "", ids: readonly string[] = [], available = false, enabled = false, brightness = 1, start = 1, tick = 480;
  const apply = (instance: ArtworkInstance) => { if (instance.id === instanceId) for (const id of ids) instance.setLayerTransform(id, { opacity: brightness }); };
  return {
    configure(instance: ArtworkInstance, groups?: DraftEnvironmentGroups) {
      const environment = groups?.environmentLayerIds ?? [], lights = groups?.lightLayerIds ?? [];
      for (const id of [...environment, ...lights]) if (id === instance.manifest.coverage.baseLayerId || !instance.manifest.layers.some(l => l.id === id)) throw Error("Invalid preview lighting group");
      if (environment.some(id => lights.includes(id))) throw Error("Preview environment overlaps protected lights");
      instanceId = instance.id; ids = [...environment]; available = !!environment.length && !!lights.length;
      enabled = false; brightness = 1; tick = 480; apply(instance);
    },
    setEnabled(value: boolean, instance: ArtworkInstance) {
      if (!available || instance.id !== instanceId || enabled === value) return;
      enabled = value;
      if (value) { brightness = 0; tick = 480; } else { start = brightness; tick = 0; }
      apply(instance);
    },
    step(instance: ArtworkInstance) {
      if (instance.id !== instanceId) return;
      if (!enabled && tick < 480) { const t = ++tick / 480; brightness = start + (1 - start) * t * t * (3 - 2 * t); }
      apply(instance);
    },
    apply,
    clear() { instanceId = ""; ids = []; available = false; enabled = false; brightness = 1; tick = 480; },
    getSnapshot: () => ({ available, enabled, brightness }),
  };
}
