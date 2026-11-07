import { Group, LinearFilter, Mesh, NoColorSpace, PlaneGeometry, ShaderMaterial, SRGBColorSpace, Texture, DataTexture, RedFormat, UnsignedByteType, Vector2, Vector4 } from "three";
import type { ArtworkInstance } from "../artwork/artwork-instance.ts";
import type { LoadedArtwork } from "../artwork/artwork-loader.ts";
import { buildBehaviorShader, behaviorUniform } from "../behaviors/behavior-shader.ts";
import { assetTextureBytes } from "../resources/texture-budget.ts";
import { placePoint, type ArtworkPlacement } from "../transition/placement.ts";
import type { PortalRegion } from "../transition/portal.ts";

export const VERTEX_SHADER = `
  varying vec2 vUv; varying vec2 artworkWorld;
  void main() {
    vUv = uv; artworkWorld = (modelMatrix * vec4(position, 1.0)).xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

/** Per-artwork GPU lease; never owns or disposes the WebGL renderer. */
export function createArtworkGpu(loaded: LoadedArtwork, instance: ArtworkInstance, maxSamplers: number, requestOptional?: (id: string) => void) {
  const group = new Group(), geometry = new PlaneGeometry(3840, 2160);
  const textures = new Map<string, Texture>();
  const selectedImages = loaded.manifest.layers.map(layer => layer.imageAssetId);
  const meshes: Mesh<PlaneGeometry, ShaderMaterial>[] = [];
  const shaders = instance.getSnapshot().layers.map(layer => buildBehaviorShader(layer.groups));
  function textureFor(id: string) {
    const previous = textures.get(id); if (previous) return previous;
    const descriptor = loaded.manifest.assets.find(asset => asset.id === id)!;
    const asset = loaded.getAsset(id);
    let texture: Texture;
    if ((descriptor.kind === "mask" || descriptor.kind === "depth")) {
      const canvas = new OffscreenCanvas(descriptor.width, descriptor.height);
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Cannot extract mask channel");
      try {
        context.drawImage(asset.image as CanvasImageSource, 0, 0);
        const rgba = context.getImageData(0, 0, descriptor.width, descriptor.height).data;
        const red = new Uint8Array(descriptor.width * descriptor.height);
        for (let i = 0; i < red.length; i++) red[i] = rgba[i * 4];
        texture = new DataTexture(red, descriptor.width, descriptor.height, RedFormat, UnsignedByteType);
        texture.unpackAlignment = 1;
      } finally { canvas.width = canvas.height = 1; }
    } else texture = new Texture(asset.image);
    textures.set(id, texture);
    texture.colorSpace = (descriptor.kind === "image" || descriptor.kind === "detail") ? SRGBColorSpace : NoColorSpace;
    texture.flipY = false; texture.premultiplyAlpha = false; texture.generateMipmaps = false;
    texture.minFilter = texture.magFilter = LinearFilter; texture.needsUpdate = true;
    return texture;
  }
  let disposed = false;
  function dispose() {
    if (disposed) return; disposed = true; group.removeFromParent(); group.clear();
    for (const mesh of meshes) mesh.material.dispose();
    for (const texture of textures.values()) texture.dispose();
    meshes.length = 0; textures.clear(); geometry.dispose();
  }
  try {
    for (const [index, layer] of loaded.manifest.layers.entries()) {
      const shader = shaders[index], image = textureFor(layer.imageAssetId);
      if (2 + shader.masks.length > maxSamplers) throw new Error("Behavior masks exceed GPU sampler limit");
      const uniforms: Record<string, { value: unknown }> = {};
      for (const mask of shader.masks) uniforms[mask.name] = { value: textureFor(mask.assetId) };
      for (const effect of shader.effects) uniforms[effect.name] = { value: [0, 0, 0, 0] };
      const material = new ShaderMaterial({ vertexShader: VERTEX_SHADER,
        fragmentShader: `
          uniform sampler2D imageMap; uniform sampler2D maskMap;
          uniform float hasMask; uniform float opacity; uniform float audioGain;
          uniform int portalCount; uniform vec4 portalData[5]; uniform vec2 portalStyle[5];
          varying vec2 vUv; varying vec2 artworkWorld;
          ${shader.declarations}
          void main() {
            // Each aperture belongs to its authored parent, including nested C.
            float portalAlpha = 1.0;
            for (int i = 0; i < 5; i++) {
              if (i >= portalCount) break;
              vec2 d = artworkWorld - portalData[i].xy;
              float c = cos(portalStyle[i].x), s = sin(portalStyle[i].x);
              vec2 b = vec2(c*d.x - s*d.y, s*d.x + c*d.y) / portalData[i].zw;
              portalAlpha *= 1.0 - smoothstep(1.0 - portalStyle[i].y, 1.0, length(b));
              if (portalAlpha <= 0.0) discard;
            }
            ${shader.body}
            vec4 color = texture2D(imageMap, sampleUv);
            float inside = step(0.0,sampleUv.x)*step(sampleUv.x,1.0)*step(0.0,sampleUv.y)*step(sampleUv.y,1.0);
            ${shader.colorBody}
            color.rgb *= min(4.0, pulseGain * audioGain);
            ${shader.glowBody}
            color.a *= inside * opacity * portalAlpha * mix(1.0, texture2D(maskMap,sampleUv).r,hasMask);
            gl_FragColor = vec4(color.rgb*color.a,color.a);
          }`,
        uniforms: { behaviorCameraOffset: { value: new Vector2() }, imageMap: { value: image }, maskMap: { value: layer.maskAssetId ? textureFor(layer.maskAssetId) : image },
          hasMask: { value: layer.maskAssetId ? 1 : 0 }, opacity: { value: 1 }, audioGain: { value: 1 }, portalCount: { value: 0 },
          portalData: { value: Array.from({ length: 5 }, () => new Vector4()) }, portalStyle: { value: Array.from({ length: 5 }, () => new Vector2()) }, ...uniforms },
        transparent: true, premultipliedAlpha: true, depthTest: false, depthWrite: false, toneMapped: false,
      });
      const mesh = new Mesh(geometry, material); meshes.push(mesh); mesh.frustumCulled = false; group.add(mesh);
    }
  } catch (failure) { dispose(); throw failure; }
  return {
    group,
    update(placement: ArtworkPlacement, portals: readonly PortalRegion[], firstOrder: number, pixelsPerArtworkPixel = 0, cameraOffset = { x: 0, y: 0 }, detailEnabled = true, detailLocked = false) {
      const center = placePoint({ x: 1920, y: 1080 }, placement);
      group.position.set(center.x - 1920, -(center.y - 1080), 0);
      group.rotation.z = -placement.rotation; group.scale.setScalar(placement.scale);
      for (const [index, layer] of instance.getSnapshot().layers.entries()) {
        const mesh = meshes[index], uniforms = mesh.material.uniforms;
        mesh.position.set(layer.x, -layer.y, 0); mesh.rotation.z = -layer.rotation; mesh.scale.setScalar(layer.scale);
        mesh.renderOrder = firstOrder + index; uniforms.opacity.value = layer.opacity;
        uniforms.audioGain.value = layer.audioGain;
        uniforms.behaviorCameraOffset.value.set(cameraOffset.x, cameraOffset.y);
        const descriptor = loaded.manifest.layers[index], base = loaded.manifest.assets.find(a => a.id === descriptor.imageAssetId)!;
        let imageId = detailLocked && detailEnabled ? selectedImages[index] : descriptor.imageAssetId;
        if (detailEnabled && !detailLocked) for (const lod of descriptor.lods ?? []) {
          if (pixelsPerArtworkPixel*3840/base.width < lod.minPixelsPerTexel) continue;
          if (loaded.hasAsset(lod.assetId)) imageId = lod.assetId; else requestOptional?.(lod.assetId);
        }
        selectedImages[index] = imageId;
        uniforms.imageMap.value = textureFor(imageId);
        uniforms.portalCount.value = portals.length;
        for (const [i, portal] of portals.entries()) {
          uniforms.portalData.value[i].set(portal.x - 1920, -(portal.y - 1080), portal.radiusX, portal.radiusY);
          uniforms.portalStyle.value[i].set(portal.rotation, portal.feather);
        }
        for (const effect of shaders[index].effects) uniforms[effect.name].value = behaviorUniform(layer.groups[effect.group].effects[effect.effect]);
      }
      return firstOrder + meshes.length;
    },
    optionalBytes() { return [...textures.keys()].reduce((sum,id) => { const a = loaded.manifest.assets.find(a => a.id === id)!; return sum+(a.critical ? 0 : assetTextureBytes(a)); },0); },
    evictOptional() {
      for (const [id,texture] of textures) if (!loaded.manifest.assets.find(a => a.id === id)!.critical) { texture.dispose(); textures.delete(id); }
      for (const [i,mesh] of meshes.entries()) { selectedImages[i]=loaded.manifest.layers[i].imageAssetId; mesh.material.uniforms.imageMap.value = textureFor(selectedImages[i]); }
    }, dispose,
  };
}
export type ArtworkGpu = ReturnType<typeof createArtworkGpu>;
