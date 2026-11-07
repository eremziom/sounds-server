import { LinearFilter, LinearSRGBColorSpace, Mesh, NoToneMapping, OrthographicCamera, PlaneGeometry,
  Scene, ShaderMaterial, SRGBColorSpace, WebGLRenderer, WebGLRenderTarget } from "three";
import { coversViewport, getCoverView, type ArtworkInstance } from "../artwork/artwork-instance.ts";
import type { LoadedArtwork } from "../artwork/artwork-loader.ts";
import { FULL_FRAME, type CameraController } from "../camera/index.ts";
import { validatePlacement } from "../transition/placement.ts";
import { createArtworkGpu, VERTEX_SHADER, type ArtworkGpu } from "./artwork-gpu.ts";
import { validatePortalPlacement } from "../transition/portal.ts";

import { artworkTextureBytes } from "../resources/texture-budget.ts";
import { compositionDraws, type SceneComposition } from "./composition.ts";
export type { SceneComposition } from "./composition.ts";

export interface ArtworkViewport {
  readonly width: number; readonly height: number; readonly dpr: number; readonly renderScale: number;
}
export interface ArtworkRendererOptions {
  readonly viewport: ArtworkViewport;
  readonly camera?: CameraController;
  readonly onAvailabilityChange: (available: boolean) => void;
  readonly onError: (error: unknown) => void;
}
interface Entry { loaded: LoadedArtwork; instance: ArtworkInstance; gpu: ArtworkGpu | null }

/** Session-owned renderer. Artwork leases attach/detach without disposing the
 * one context. No RAF, playback or simulation ownership. */
export function createArtworkRenderer(canvas: HTMLCanvasElement, loaded: LoadedArtwork, instance: ArtworkInstance, options: ArtworkRendererOptions) {
  const renderer = new WebGLRenderer({ canvas, alpha: true, premultipliedAlpha: true, antialias: false });
  renderer.outputColorSpace = SRGBColorSpace; renderer.toneMapping = NoToneMapping; renderer.setClearColor(0x000000, 0);
  renderer.debug.onShaderError = () => { throw new Error("Artwork shader compilation/link failed"); };
  const scene = new Scene(), output = new Scene();
  const camera = new OrthographicCamera(-1920, 1920, 1080, -1080, 0.1, 10);
  const outputCamera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10); outputCamera.position.z = 1;
  const entries = new Map<string, Entry>();
  let composition: SceneComposition = Object.freeze({ sourceId: instance.id });
  let viewport = Object.freeze({ ...options.viewport }), available = true, disposed = false;
  let maximumDimension = renderer.capabilities.maxTextureSize;
  let target: WebGLRenderTarget | null = null, outputGeometry: PlaneGeometry | null = null, outputMaterial: ShaderMaterial | null = null;
  function entry(id: string) { const value = entries.get(id); if (!value) throw new Error(`Unknown rendered artwork: ${id}`); return value; }
  function checkAlive() { if (disposed) throw new Error("Renderer is disposed"); }
  function dimensions(next: ArtworkViewport) {
    const view = getCoverView(next.width, next.height);
    if (!Number.isFinite(next.dpr) || next.dpr <= 0 || !Number.isFinite(next.renderScale) || next.renderScale <= 0 || next.renderScale > 1) throw new Error("Invalid viewport DPR/render scale");
    const width = Math.max(1, Math.ceil(next.width * next.dpr * next.renderScale)), height = Math.max(1, Math.ceil(next.height * next.dpr * next.renderScale));
    if (width > maximumDimension || height > maximumDimension) throw new Error("Viewport exceeds GPU dimensions");
    return { view, width, height };
  }
  function validateSource(next = viewport) {
    const source = entry(composition.sourceId), base = source.instance.getSnapshot().layers[0];
    if (!coversViewport(base, getCoverView(next.width, next.height), options.camera?.getSnapshot().pose ?? FULL_FRAME)) throw new Error("COVERAGE_INVALID: opaque base does not cover viewport");
  }
  function applyViewport(next: ArtworkViewport) {
    const { view, width, height } = dimensions(next);
    camera.left = -view.width / 2; camera.right = view.width / 2; camera.top = view.height / 2; camera.bottom = -view.height / 2;
    camera.updateProjectionMatrix(); renderer.setSize(width, height, false); target!.setSize(width, height); viewport = Object.freeze({ ...next });
  }
  function releaseGpu() {
    scene.clear(); output.clear();
    for (const value of entries.values()) { value.gpu?.dispose(); value.gpu = null; }
    outputGeometry?.dispose(); outputGeometry = null; outputMaterial?.dispose(); outputMaterial = null; target?.dispose(); target = null;
  }
  function buildGpu() {
    maximumDimension = Math.min(renderer.capabilities.maxTextureSize, renderer.getContext().getParameter(renderer.getContext().MAX_RENDERBUFFER_SIZE) as number);
    if (renderer.capabilities.maxTextureSize < 3840) throw new Error("GPU cannot hold critical artwork at authored resolution");
    for (const value of entries.values()) value.gpu = createArtworkGpu(value.loaded, value.instance, renderer.capabilities.maxTextures);
    target = new WebGLRenderTarget(1, 1, { depthBuffer: false, stencilBuffer: false, minFilter: LinearFilter, magFilter: LinearFilter, colorSpace: LinearSRGBColorSpace });
    outputGeometry = new PlaneGeometry(2, 2);
    outputMaterial = new ShaderMaterial({ vertexShader: VERTEX_SHADER,
      fragmentShader: `uniform sampler2D composed; varying vec2 vUv;
        void main() { gl_FragColor = texture2D(composed,vUv);
          #include <colorspace_fragment>
        }`,
      uniforms: { composed: { value: target.texture } }, depthTest: false, depthWrite: false, toneMapped: false });
    output.add(new Mesh(outputGeometry, outputMaterial)); applyViewport(viewport);
  }
  function draw(current: SceneComposition, display: boolean) {
    const pose = options.camera?.getSnapshot().pose ?? FULL_FRAME;
    camera.position.set(pose.x - 1920, -(pose.y - 1080), 1); camera.rotation.z = -pose.rotation; camera.zoom = Math.exp(pose.logScale); camera.updateProjectionMatrix();
    scene.clear();
    let order = 0;
    const batch = new Set<string>();
    renderer.setRenderTarget(target); renderer.clear(); renderer.autoClear = false;
    try {
      for (const draw of compositionDraws(current, pose)) {
        // Repeated cycle placements share the same GPU artwork and textures.
        // Flush before reusing its meshes with a different transform/aperture.
        if (batch.has(draw.id)) { renderer.render(scene, camera); scene.clear(); batch.clear(); }
        batch.add(draw.id);
        const artwork = entry(draw.id).gpu!;
        order = artwork.update(draw.placement, draw.portals, order); scene.add(artwork.group);
      }
      renderer.render(scene, camera);
    } finally { renderer.autoClear = true; }
    renderer.setRenderTarget(null); if (display) renderer.render(output, outputCamera);
    const gl = renderer.getContext();
    if (gl.isContextLost()) throw new Error("GPU context unavailable during rendering");
    const error = gl.getError(); if (error !== gl.NO_ERROR) throw new Error(`GPU rejected artwork rendering (${error})`);
  }
  function render() {
    checkAlive(); if (!available) return;
    try { validateSource(); draw(composition, true); }
    catch (failure) {
      // Context loss can become observable in a draw before the browser emits
      // webglcontextlost. Suspend immediately instead of poisoning the logical
      // controller with a terminal render error; the event still gets cancelled.
      if (renderer.getContext().isContextLost()) { onLost(new Event("webglcontextlost")); return; }
      throw failure;
    }
  }
  function setComposition(next: SceneComposition) {
    checkAlive();
    function freeze(node: SceneComposition, depth = 0): SceneComposition {
      if (depth > 5) throw new Error("Artwork nesting exceeds demo limit");
      entry(node.sourceId);
      if (node.destinationId) {
        entry(node.destinationId); validatePlacement(node.placement!);
        if (!node.portal || node.sourceId === node.destinationId) throw new Error("Invalid portal composition");
        validatePortalPlacement(node.portal, node.placement!);
      } else if (node.destinationComposition) throw new Error("Nested composition needs a destination");
      return Object.freeze({ ...node, ...(node.placement ? { placement: Object.freeze({ ...node.placement }) } : {}),
        ...(node.portal ? { portal: Object.freeze({ ...node.portal }) } : {}),
        ...(node.destinationComposition ? { destinationComposition: freeze(node.destinationComposition, depth + 1) } : {}) });
    }
    const candidate = freeze(next);
    compositionDraws(candidate, options.camera?.getSnapshot().pose ?? FULL_FRAME);
    composition = candidate;
  }

  function detach(id: string) {
    const value = entries.get(id); if (!value) return;
    if (compositionDraws(composition, options.camera?.getSnapshot().pose ?? FULL_FRAME).some(draw => draw.id === id)) throw new Error("Cannot release a visible artwork");
    value.gpu?.dispose(); entries.delete(id);
  }
  function onLost(event: Event) {
    event.preventDefault(); if (disposed || !available) return;
    available = false; releaseGpu(); options.onAvailabilityChange(false);
  }
  function onRestored() {
    if (disposed) return;
    try { buildGpu(); available = true; render(); if (available) options.onAvailabilityChange(true); }
    catch (failure) { available = false; releaseGpu(); options.onError(failure); }
  }
  function dispose() {
    if (disposed) return; disposed = true; available = false;
    canvas.removeEventListener("webglcontextlost", onLost); canvas.removeEventListener("webglcontextrestored", onRestored);
    releaseGpu(); entries.clear(); renderer.dispose(); renderer.forceContextLoss();
  }
  if (instance.manifest !== loaded.manifest) { dispose(); throw new Error("Renderer and instance must share a loaded package"); }
  entries.set(instance.id, { loaded, instance, gpu: null });
  canvas.addEventListener("webglcontextlost", onLost); canvas.addEventListener("webglcontextrestored", onRestored);
  try {
    buildGpu(); render();
    if (!available) throw new Error("GPU unavailable during critical preparation");
  } catch (failure) { dispose(); throw failure; }
  return {
    render, setComposition, detach,
    attach(artwork: LoadedArtwork, artworkInstance: ArtworkInstance) {
      checkAlive();
      const existing = entries.get(artworkInstance.id);
      if (existing?.loaded === artwork && existing.instance === artworkInstance) return;
      if (existing || artwork.manifest !== artworkInstance.manifest) throw new Error("Invalid artwork attachment");
      const value: Entry = { loaded: artwork, instance: artworkInstance, gpu: null }; entries.set(artworkInstance.id, value);
      // Reset during context loss updates retained descriptors only. Recovery
      // will rebuild the whole embedded composition before releasing suspension.
      if (!available) return;
      try {
        value.gpu = createArtworkGpu(artwork, artworkInstance, renderer.capabilities.maxTextures);
        draw({ sourceId: artworkInstance.id }, false); render();
      } catch (failure) { value.gpu?.dispose(); entries.delete(artworkInstance.id); throw failure; }
    },
    resize(next: ArtworkViewport) {
      checkAlive(); validateSource(next);
      if (!available) { dimensions(next); viewport = Object.freeze({ ...next }); return; }
      applyViewport(next); render();
    },
    getDiagnostics() { return Object.freeze({ available, disposed, width: canvas.width, height: canvas.height,
      estimatedTextureBytes: [...entries.values()].reduce((sum, value) => sum + artworkTextureBytes(value.loaded.manifest), 0),
      estimatedTargetBytes: target ? canvas.width * canvas.height * 4 : 0,
      artworks: entries.size, textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries,
      programs: renderer.info.programs?.length ?? 0 }); },
    dispose,
  };
}
export type ArtworkRenderer = ReturnType<typeof createArtworkRenderer>;
