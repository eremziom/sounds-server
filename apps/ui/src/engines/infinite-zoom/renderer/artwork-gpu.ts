import { Group, LinearFilter, Mesh, NoColorSpace, PlaneGeometry, ShaderMaterial, SRGBColorSpace, Texture, Vector2 } from "three";
import type { ArtworkInstance } from "../artwork/artwork-instance.ts";
import type { LoadedArtwork } from "../artwork/artwork-loader.ts";
import { buildBehaviorShader, behaviorUniform } from "../behaviors/behavior-shader.ts";
import { placePoint, type ArtworkPlacement } from "../transition/placement.ts";

export const VERTEX_SHADER = `
  varying vec2 vUv; varying vec2 artworkWorld;
  void main() {
    vUv = uv; artworkWorld = (modelMatrix * vec4(position, 1.0)).xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

/** Per-artwork GPU lease; never owns or disposes the WebGL renderer. */
export function createArtworkGpu(loaded: LoadedArtwork, instance: ArtworkInstance, maxSamplers: number) {
  const group = new Group(), geometry = new PlaneGeometry(3840, 2160);
  const textures = new Map<string, Texture>();
  const meshes: Mesh<PlaneGeometry, ShaderMaterial>[] = [];
  const shaders = instance.getSnapshot().layers.map(layer => buildBehaviorShader(layer.groups));
  function textureFor(id: string) {
    const previous = textures.get(id); if (previous) return previous;
    const descriptor = loaded.manifest.assets.find(asset => asset.id === id)!;
    const texture = new Texture(loaded.getAsset(id).image); textures.set(id, texture);
    texture.colorSpace = descriptor.kind === "image" ? SRGBColorSpace : NoColorSpace;
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
          uniform float reveal; uniform vec2 revealCenter; uniform float revealAngle; uniform float revealScale;
          varying vec2 vUv; varying vec2 artworkWorld;
          ${shader.declarations}
          void main() {
            // Geometric B window, independent of image/visibility/influence.
            if (reveal >= 0.0) {
              vec2 d = artworkWorld - revealCenter;
              float c = cos(revealAngle), s = sin(revealAngle);
              vec2 b = vec2(c*d.x - s*d.y, s*d.x + c*d.y) / revealScale;
              if (max(abs(b.x)/1920.0, abs(b.y)/1080.0) > reveal || reveal == 0.0) discard;
            }
            ${shader.body}
            vec4 color = texture2D(imageMap, sampleUv);
            float inside = step(0.0,sampleUv.x)*step(sampleUv.x,1.0)*step(0.0,sampleUv.y)*step(sampleUv.y,1.0);
            color.rgb *= min(4.0, pulseGain * audioGain);
            color.a *= inside * opacity * mix(1.0, texture2D(maskMap,sampleUv).r,hasMask);
            gl_FragColor = vec4(color.rgb*color.a,color.a);
          }`,
        uniforms: { imageMap: { value: image }, maskMap: { value: layer.maskAssetId ? textureFor(layer.maskAssetId) : image },
          hasMask: { value: layer.maskAssetId ? 1 : 0 }, opacity: { value: 1 }, audioGain: { value: 1 }, reveal: { value: -1 },
          revealCenter: { value: new Vector2() }, revealAngle: { value: 0 }, revealScale: { value: 1 }, ...uniforms },
        transparent: true, premultipliedAlpha: true, depthTest: false, depthWrite: false, toneMapped: false,
      });
      const mesh = new Mesh(geometry, material); meshes.push(mesh); mesh.frustumCulled = false; group.add(mesh);
    }
  } catch (failure) { dispose(); throw failure; }
  return {
    group,
    update(placement: ArtworkPlacement, reveal: number, firstOrder: number) {
      const center = placePoint({ x: 1920, y: 1080 }, placement);
      group.position.set(center.x - 1920, -(center.y - 1080), 0);
      group.rotation.z = -placement.rotation; group.scale.setScalar(placement.scale);
      for (const [index, layer] of instance.getSnapshot().layers.entries()) {
        const mesh = meshes[index], uniforms = mesh.material.uniforms;
        mesh.position.set(layer.x, -layer.y, 0); mesh.rotation.z = -layer.rotation; mesh.scale.setScalar(layer.scale);
        mesh.renderOrder = firstOrder + index; uniforms.opacity.value = layer.opacity;
        uniforms.audioGain.value = layer.audioGain;
        uniforms.reveal.value = reveal; uniforms.revealCenter.value.set(center.x - 1920, -(center.y - 1080));
        uniforms.revealAngle.value = placement.rotation; uniforms.revealScale.value = placement.scale;
        for (const effect of shaders[index].effects) uniforms[effect.name].value = behaviorUniform(layer.groups[effect.group].effects[effect.effect]);
      }
      return firstOrder + meshes.length;
    }, dispose,
  };
}
export type ArtworkGpu = ReturnType<typeof createArtworkGpu>;
