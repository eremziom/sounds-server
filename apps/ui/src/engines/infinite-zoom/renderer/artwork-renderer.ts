import {
  LinearFilter, LinearSRGBColorSpace, Mesh, NoColorSpace, NoToneMapping,
  OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, SRGBColorSpace,
  Texture, WebGLRenderer, WebGLRenderTarget,
} from "three";
import { coversViewport, getCoverView, type ArtworkInstance } from "../artwork/artwork-instance.ts";
import type { LoadedArtwork } from "../artwork/artwork-loader.ts";
import { FULL_FRAME, type CameraController } from "../camera/index.ts";
import { buildBehaviorShader, behaviorUniform } from "../behaviors/behavior-shader.ts";

export interface ArtworkViewport {
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
  readonly renderScale: number;
}

export interface ArtworkRendererOptions {
  readonly viewport: ArtworkViewport;
  readonly camera?: CameraController;
  /** Map availability to the controller's context-lost suspension. */
  readonly onAvailabilityChange: (available: boolean) => void;
  readonly onError: (error: unknown) => void;
}

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

function layerFragmentShader(declarations: string, body: string) { return `
  uniform sampler2D imageMap;
  uniform sampler2D maskMap;
  uniform float hasMask;
  uniform float opacity;
  varying vec2 vUv;
  ${declarations}
  void main() {
    ${body}
    // sRGB image textures decode to linear through their GPU internal format.
    vec4 color = texture2D(imageMap, sampleUv);
    float inside = step(0.0, sampleUv.x) * step(sampleUv.x, 1.0) * step(0.0, sampleUv.y) * step(sampleUv.y, 1.0);
    color.rgb *= pulseGain;
    color.a *= inside * opacity * mix(1.0, texture2D(maskMap, sampleUv).r, hasMask);
    gl_FragColor = vec4(color.rgb * color.a, color.a);
  }
`; }

/** One renderer, no RAF and no simulation clock. Compose premultiplied layers
 * into a linear-light target, then encode once for the display. CPU bitmaps are
 * owned by LoadedArtwork and retained for context recovery. */
export function createArtworkRenderer(
  canvas: HTMLCanvasElement, loaded: LoadedArtwork, instance: ArtworkInstance, options: ArtworkRendererOptions,
) {
  if (instance.manifest !== loaded.manifest) throw new Error("Renderer and instance must share a loaded package");
  const renderer = new WebGLRenderer({ canvas, alpha: true, premultipliedAlpha: true, antialias: false });
  let maximumDimension = Math.min(renderer.capabilities.maxTextureSize,
    renderer.getContext().getParameter(renderer.getContext().MAX_RENDERBUFFER_SIZE) as number);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  renderer.setClearColor(0x000000, 0);
  renderer.debug.checkShaderErrors = true;
  renderer.debug.onShaderError = () => { throw new Error("Artwork shader compilation/link failed"); };
  const scene = new Scene(), outputScene = new Scene();
  const camera = new OrthographicCamera(-1920, 1920, 1080, -1080, 0.1, 10);
  const outputCamera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = outputCamera.position.z = 1;
  let disposed = false, available = true;
  let viewport = options.viewport;
  let target: WebGLRenderTarget | null = null;
  let geometry: PlaneGeometry | null = null, outputGeometry: PlaneGeometry | null = null;
  let outputMaterial: ShaderMaterial | null = null;
  const textures = new Map<string, Texture>();
  const meshes: Mesh<PlaneGeometry, ShaderMaterial>[] = [];
  const behaviorShaders = instance.getSnapshot().layers.map(layer => buildBehaviorShader(layer.groups));

  function releaseGpu() {
    scene.clear(); outputScene.clear();
    for (const mesh of meshes) mesh.material.dispose();
    meshes.length = 0;
    for (const texture of textures.values()) texture.dispose();
    textures.clear();
    geometry?.dispose(); geometry = null;
    outputGeometry?.dispose(); outputGeometry = null;
    outputMaterial?.dispose(); outputMaterial = null;
    target?.dispose(); target = null;
  }

  function textureFor(id: string) {
    const previous = textures.get(id);
    if (previous) return previous;
    const descriptor = loaded.manifest.assets.find(asset => asset.id === id)!;
    const texture = new Texture(loaded.getAsset(id).image);
    textures.set(id, texture);
    texture.colorSpace = descriptor.kind === "image" ? SRGBColorSpace : NoColorSpace;
    texture.flipY = false;
    texture.premultiplyAlpha = false;
    texture.generateMipmaps = false;
    texture.minFilter = texture.magFilter = LinearFilter;
    texture.needsUpdate = true;
    return texture;
  }

  function dimensions(next: ArtworkViewport) {
    const view = getCoverView(next.width, next.height);
    if (!Number.isFinite(next.dpr) || next.dpr <= 0 || !Number.isFinite(next.renderScale) || next.renderScale <= 0 || next.renderScale > 1) {
      throw new Error("Invalid viewport DPR/render scale");
    }
    const width = Math.max(1, Math.ceil(next.width * next.dpr * next.renderScale));
    const height = Math.max(1, Math.ceil(next.height * next.dpr * next.renderScale));
    if (width > maximumDimension || height > maximumDimension) throw new Error("Viewport exceeds GPU dimensions");
    return { view, width, height };
  }

  function applyViewport(next: ArtworkViewport) {
    const { view, width, height } = dimensions(next);
    camera.left = -view.width / 2; camera.right = view.width / 2;
    camera.top = view.height / 2; camera.bottom = -view.height / 2;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    target!.setSize(width, height);
    viewport = Object.freeze({ ...next });
  }

  function buildGpu() {
    maximumDimension = Math.min(renderer.capabilities.maxTextureSize,
      renderer.getContext().getParameter(renderer.getContext().MAX_RENDERBUFFER_SIZE) as number);
    const maxSize = renderer.capabilities.maxTextureSize;
    if (maxSize < 3840) throw new Error("GPU cannot hold critical artwork at authored resolution");
    geometry = new PlaneGeometry(3840, 2160);
    for (const [index, layer] of loaded.manifest.layers.entries()) {
      const image = textureFor(layer.imageAssetId);
      const behavior = behaviorShaders[index];
      if (2 + behavior.masks.length > renderer.capabilities.maxTextures) throw new Error("Behavior masks exceed GPU sampler limit");
      const behaviorUniforms: Record<string, { value: unknown }> = {};
      for (const mask of behavior.masks) behaviorUniforms[mask.name] = { value: textureFor(mask.assetId) };
      for (const effect of behavior.effects) behaviorUniforms[effect.name] = { value: [0, 0, 0, 0] };
      const material = new ShaderMaterial({
        vertexShader, fragmentShader: layerFragmentShader(behavior.declarations, behavior.body),
        uniforms: { imageMap: { value: image }, maskMap: { value: layer.maskAssetId ? textureFor(layer.maskAssetId) : image },
          hasMask: { value: layer.maskAssetId ? 1 : 0 }, opacity: { value: 1 }, ...behaviorUniforms },
        transparent: true, premultipliedAlpha: true, depthTest: false, depthWrite: false, toneMapped: false,
      });
      const mesh = new Mesh(geometry, material);
      meshes.push(mesh);
      mesh.renderOrder = index;
      mesh.frustumCulled = false;
      scene.add(mesh);
    }
    target = new WebGLRenderTarget(1, 1, { depthBuffer: false, stencilBuffer: false,
      minFilter: LinearFilter, magFilter: LinearFilter, colorSpace: LinearSRGBColorSpace });
    outputGeometry = new PlaneGeometry(2, 2);
    outputMaterial = new ShaderMaterial({ vertexShader,
      fragmentShader: `
        uniform sampler2D composed;
        varying vec2 vUv;
        void main() {
          gl_FragColor = texture2D(composed, vUv);
          #include <colorspace_fragment>
        }
      `,
      uniforms: { composed: { value: target.texture } }, depthTest: false, depthWrite: false, toneMapped: false,
    });
    outputScene.add(new Mesh(outputGeometry, outputMaterial));
    applyViewport(viewport);
  }

  function render() {
    if (disposed) throw new Error("Renderer is disposed");
    if (!available) return;
    const snapshot = instance.getSnapshot();
    const base = snapshot.layers.find(layer => layer.id === loaded.manifest.coverage.baseLayerId)!;
    const pose = options.camera?.getSnapshot().pose ?? FULL_FRAME;
    if (!coversViewport(base, getCoverView(viewport.width, viewport.height), pose)) throw new Error("COVERAGE_INVALID: opaque base does not cover viewport");
    camera.position.set(pose.x - 1920, -(pose.y - 1080), 1);
    camera.rotation.z = -pose.rotation;
    camera.zoom = Math.exp(pose.logScale);
    camera.updateProjectionMatrix();
    for (const [index, layer] of snapshot.layers.entries()) {
      const mesh = meshes[index];
      // Runtime uses artwork pixels (x right, y down) and clockwise radians.
      mesh.position.set(layer.x, -layer.y, 0);
      mesh.rotation.z = -layer.rotation;
      mesh.scale.setScalar(layer.scale);
      mesh.material.uniforms.opacity.value = layer.opacity;
      for (const effect of behaviorShaders[index].effects) {
        mesh.material.uniforms[effect.name].value = behaviorUniform(layer.groups[effect.group].effects[effect.effect]);
      }
    }
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(outputScene, outputCamera);
    if (renderer.getContext().isContextLost()) throw new Error("GPU context unavailable during rendering");
    const gpuError = renderer.getContext().getError();
    if (gpuError !== renderer.getContext().NO_ERROR) throw new Error(`GPU rejected artwork rendering (${gpuError})`);
  }

  function onLost(event: Event) {
    event.preventDefault();
    if (disposed) return;
    available = false;
    // Detach old GPU dispose listeners while their Three context managers still
    // exist. Disposing old handles after restoration would delete objects from
    // a previous WebGL context generation (INVALID_OPERATION).
    releaseGpu();
    options.onAvailabilityChange(false);
  }

  function onRestored() {
    if (disposed) return;
    try {
      // Three rebuilds its context internals first (its listener was registered
      // before ours). Recreate all owned GPU objects from retained descriptors.
      releaseGpu(); buildGpu();
      available = true;
      render();
      options.onAvailabilityChange(true);
    } catch (failure) {
      available = false;
      options.onError(failure);
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true; available = false;
    canvas.removeEventListener("webglcontextlost", onLost);
    canvas.removeEventListener("webglcontextrestored", onRestored);
    releaseGpu();
    renderer.dispose();
    renderer.forceContextLoss();
  }

  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);
  try { buildGpu(); render(); } catch (failure) { dispose(); throw failure; }
  return {
    render,
    resize(next: ArtworkViewport) {
      if (disposed) throw new Error("Renderer is disposed");
      // Check coverage before resizing exposes a newly unsafe viewport.
      const base = instance.getSnapshot().layers.find(layer => layer.id === loaded.manifest.coverage.baseLayerId)!;
      if (!coversViewport(base, getCoverView(next.width, next.height), options.camera?.getSnapshot().pose ?? FULL_FRAME)) throw new Error("COVERAGE_INVALID: resize blocked");
      if (!available) { dimensions(next); viewport = Object.freeze({ ...next }); return; }
      applyViewport(next); render();
    },
    getDiagnostics() {
      return Object.freeze({ available, disposed, width: canvas.width, height: canvas.height,
        textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries,
        programs: renderer.info.programs?.length ?? 0 });
    },
    dispose,
  };
}

export type ArtworkRenderer = ReturnType<typeof createArtworkRenderer>;
