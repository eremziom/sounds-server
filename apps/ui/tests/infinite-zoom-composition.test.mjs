import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { compositionDraws } from "../src/engines/infinite-zoom/renderer/composition.ts";
import { cameraMatrix, FULL_FRAME } from "../src/engines/infinite-zoom/camera/camera-math.ts";
import { destinationView, destinationRenderPlacement } from "../src/engines/infinite-zoom/transition/destination-view.ts";
import { cameraInDestination, placePoint } from "../src/engines/infinite-zoom/transition/placement.ts";
import { portalTarget } from "../src/engines/infinite-zoom/transition/portal.ts";
import { parseArtworkPackage } from "../src/engines/infinite-zoom/artwork/artwork-package.ts";
import { prepareArtwork } from "../src/engines/infinite-zoom/artwork/prepare-artwork.ts";
import { artworkTextureBytes } from "../src/engines/infinite-zoom/resources/texture-budget.ts";

const manifests = await Promise.all(["forest", "nebula", "underwater-cavern"].map(async name =>
  JSON.parse(await readFile(new URL(`../public/infinite-zoom/samples/${name}/manifest.json`, import.meta.url), "utf8"))));
function link(manifest, a, b) {
  const p = manifest.portal;
  return { sourceId: a, destinationId: b, placement: { x: p.region.x, y: p.region.y, scale: p.scale,
    rotation: p.region.rotation, anchorX: 1920, anchorY: 1080 }, portal: p.region, destinationCamera: p.destinationCamera };
}
const ab = link(manifests[0], "a", "b"), bc = link(manifests[1], "b", "c");
const chain = { ...ab, destinationComposition: bc };
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-7, `${a} ~ ${b}`);
function project(pose, point) { const m = cameraMatrix(pose); return [m[0]*point.x+m[1]*point.y+m[2],m[3]*point.x+m[4]*point.y+m[5]]; }

test("nested landmarks and both authored apertures follow their parent coordinate systems", () => {
  const pose = { x: 1900, y: 1040, rotation: 0.08, logScale: 1.7 };
  const draws = compositionDraws(chain, pose);
  assert.deepEqual(draws.map(d => [d.id, d.portals.length]), [["a",0],["b",1],["c",2]]);
  const bPose = destinationView(pose, ab.placement, ab.destinationCamera);
  const cPose = destinationView(bPose, bc.placement, bc.destinationCamera);
  for (const point of [{x:1000,y:500},{x:1920,y:1080},{x:2200,y:1400}]) {
    const actual = project(pose, placePoint(point, draws[2].placement));
    const expected = project(cPose, point);
    actual.forEach((v,i) => near(v,expected[i]));
  }
  const center = placePoint(bc.portal, draws[1].placement);
  near(draws[2].portals[1].x,center.x); near(draws[2].portals[1].y,center.y);
  near(draws[2].portals[1].radiusX,bc.portal.radiusX*draws[1].placement.scale);
});

test("first handoff retains C landmarks and its B aperture, with independent B full-frame hold", () => {
  const target = portalTarget(ab.portal, {width:3840,height:2160});
  const bPose = cameraInDestination(target, destinationRenderPlacement(target,ab.placement,ab.destinationCamera));
  const before = compositionDraws(chain,target), after = compositionDraws(bc,bPose);
  for (const point of [{x:1700,y:900},{x:1920,y:1080}]) {
    const a=project(target,placePoint(point,before[2].placement)), b=project(bPose,placePoint(point,after[1].placement));
    a.forEach((v,i)=>near(v,b[i]));
  }
  for (const z of [3.1,3.4,3.8]) {
    const pose={...target,logScale:z};
    assert.deepEqual(destinationView(pose,ab.placement,ab.destinationCamera),FULL_FRAME);
  }
  const repeat=(depth)=>depth===0?{sourceId:"a"}:{...ab,destinationId:"a",destinationComposition:repeat(depth-1)};
  assert.equal(compositionDraws(repeat(5),FULL_FRAME).length,6);
  assert.throws(()=>compositionDraws(repeat(6),FULL_FRAME),/bounded/);
});

test("three full-resolution image pairs and exact R8 masks fit the unchanged 256 MiB budget", () => {
  const bytes=manifests.map(m=>artworkTextureBytes(parseArtworkPackage(m)));
  assert.deepEqual(bytes,[74649600,74649600,74649600]);
  assert.ok(bytes.reduce((a,b)=>a+b,0)+3840*2160*4 < 256*1024*1024);
});

test("third-world failures, invalid links and admission refusal clean up before readiness", async () => {
  for (const mode of ["missing", "identity", "decode", "budget", "too-deep", "abort"]) {
    const closed=[], controller=new AbortController(); let resolved=0;
    const source=structuredClone(manifests[0]);
    await assert.rejects(prepareArtwork({ canvas:{}, manifest:source, instanceId:"a",
      viewport:{width:640,height:360,dpr:1,renderScale:1}, onAvailabilityChange(){},onError(){},
      gpuBudgetBytes:mode==="budget" ? 180*1024*1024 : undefined,
      async resolveManifest() {
        resolved++;
        if (resolved===1) {
          const b=structuredClone(manifests[1]);
          if(mode==="cycle") b.portal.destination={...b.portal.destination,artworkId:"forest",manifestUri:"/infinite-zoom/samples/forest/manifest.json"};
          return b;
        }
        if(mode==="cycle") return source;
        if (mode==="missing") throw new Error("missing C");
        if (mode==="abort") controller.abort();
        const third=structuredClone(manifests[2]);
        if (mode==="identity") third.version="wrong";
        if (mode==="too-deep") third.portal=structuredClone(manifests[1].portal);
        return third;
      },
      async decode() {
        if(mode==="decode" && closed.length===7) throw new Error("C decode failed");
        const asset={width:3840,height:2160,opaque:true,image:{},closes:0,close(){this.closes++;}};
        closed.push(asset); return asset;
      },
    },controller.signal));
    assert.ok(closed.length>=3,mode); assert.ok(closed.every(a=>a.closes===1),mode);
  }
});
