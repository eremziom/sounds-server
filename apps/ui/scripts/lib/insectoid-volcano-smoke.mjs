import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";

// Artwork-source coordinates, not pixels of the square generated smoke source.
export const SMOKE_PLACEMENT={x:1122,y:6,width:220,height:220,sourceTipX:630,sourceTipY:1200,sourceDomain:1280};
export const SMOKE_PIN_Y=197;
// Virtual wind lever below the plume, with the actual root pinned separately by
// influence. A crater-height pivot would make full-canvas bend imperceptible on
// this small distant asset because the operator uses a 2160-pixel quadratic span.
export const SMOKE_BEND_PIVOT_Y=1100;
export const VOLCANO_RIM=[[1080,278],[1138,249],[1207,224],[1229,211],[1240,215],[1260,232],[1300,244],[1330,255],[1350,264],[1370,330],[1080,330]];
const rim=`<polygon points="${VOLCANO_RIM.map(p=>p.join(",")).join(" ")}" fill="black"/>`;

/** Authoring-only assembly. No runtime engine code or animation clock here. */
export async function createVolcanoSmoke({root,svg,asset,op,plateImage}){
  const clean=await readFile(new URL("volcano-clean-source.png",root));
  const draft=await readFile(new URL("volcano-smoke-source.png",root));
  const plume=await readFile(new URL("volcano-smoke-refined-source.png",root));
  const provenance=(file,bytes)=>({file,width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20),sha256:createHash("sha256").update(bytes).digest("hex")});
  // A soft local replacement only. A separate solid-terrain exclusion ensures
  // feathering cannot replace the original crater or mountain silhouette.
  const patch=`<defs><filter id="patch-soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="10"/></filter><mask id="clean-site" maskUnits="userSpaceOnUse" x="0" y="0" width="1672" height="941"><rect width="1672" height="941" fill="black"/><path d="M 1120 45 Q 1194 28 1265 64 Q 1323 100 1312 161 L 1270 207 L 1206 210 Q 1144 178 1120 128 Z" fill="white" filter="url(#patch-soft)"/>${rim}</mask></defs>`;
  const plateBody=`${plateImage}${patch}<image width="1672" height="941" preserveAspectRatio="none" href="data:image/png;base64,${clean.toString("base64")}" mask="url(#clean-site)"/>`;
  const p=SMOKE_PLACEMENT;
  await asset("volcano-smoke","image",svg(`<image x="${p.x}" y="${p.y}" width="${p.width}" height="${p.height}" preserveAspectRatio="none" href="data:image/png;base64,${plume.toString("base64")}"/>`));
  const visibility=`<defs><linearGradient id="tip" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="22"><stop stop-color="black"/><stop offset="1" stop-color="white"/></linearGradient></defs><rect width="1672" height="941" fill="black"/><rect x="1080" y="0" width="290" height="232" fill="url(#tip)"/>${rim}`;
  await asset("visible-volcano-smoke","mask",svg(visibility));
  const influence=`<defs><linearGradient id="pin" gradientUnits="userSpaceOnUse" x1="0" y1="${SMOKE_PIN_Y}" x2="0" y2="55"><stop stop-color="black"/><stop offset=".12" stop-color="black"/><stop offset=".4" stop-color="#555"/><stop offset="1" stop-color="white"/></linearGradient></defs><rect width="1672" height="941" fill="black"/><rect x="1080" y="0" width="290" height="${SMOKE_PIN_Y}" fill="url(#pin)"/>`;
  await asset("influence-volcano-smoke","mask",svg(influence));
  // Smooth, seeded offline vector field. Linear RG decodes as 2*RG-1; the
  // bounded green range supplies upward-biased periodic curling, not advection.
  const field=`<defs><filter id="field" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".035 .055" numOctaves="2" seed="37"/><feColorMatrix type="matrix" values=".3 0 0 0 .35 0 .16 0 0 .3 0 0 0 0 .5 0 0 0 0 1"/></filter></defs><rect width="1672" height="941" fill="#808080"/><rect x="1080" width="290" height="232" filter="url(#field)"/>`;
  await asset("volcano-smoke-field","flow",svg(field));
  await asset("light-volcano-smoke-base","mask",svg(`<defs><radialGradient id="base"><stop stop-color="white"/><stop offset="1" stop-color="black"/></radialGradient></defs><rect width="1672" height="941" fill="black"/><ellipse cx="1230" cy="201" rx="17" ry="22" fill="url(#base)"/>${rim}`));
  return{
    plateBody,
    sources:[provenance("volcano-clean-source.png",clean),provenance("volcano-smoke-source.png",draft),provenance("volcano-smoke-refined-source.png",plume)],
    layer:{id:"distant-volcano-smoke",zIndex:14,imageAssetId:"volcano-smoke",maskAssetId:"visible-volcano-smoke",behaviors:[
      op("flow",{amplitude:36,fieldAssetId:"volcano-smoke-field",frequencyHz:.075,phase:0},{influenceMaskAssetId:"influence-volcano-smoke"}),
      op("bend",{amount:180,pivotX:1230*3840/1672,pivotY:SMOKE_BEND_PIVOT_Y,axis:"x",frequencyHz:.09,phase:1.1},{influenceMaskAssetId:"influence-volcano-smoke"}),
      op("opacity",{base:.78,amount:.16,frequencyHz:.087,phase:.3},{influenceMaskAssetId:"influence-volcano-smoke"}),
      op("glow",{amount:.2,threshold:.02,frequencyHz:.16,phase:.4},{influenceMaskAssetId:"light-volcano-smoke-base"}),
    ]},
    metadata:{placement:SMOKE_PLACEMENT,pinY:SMOKE_PIN_Y,rim:VOLCANO_RIM,flowAmplitude:36,flowHz:.075,bendAmount:180,bendPivotY:SMOKE_BEND_PIVOT_Y,bendHz:.09,opacityHz:.087,
      backing:"Only a softly masked local clean-source patch above the right crater is composed into the registered plate; original terrain excluded. All inherited visual overlays sample the same cleaned plate.",
      motion:"Periodic bounded curl/bend with zero spatial influence at y>=197 and softly varying upper opacity. No physical upward advection or new emitted smoke.",
      limits:"Source field R .35.. .65 and G .30.. .46 imply <=.5 vector norm; <=18-world-pixel flow plus <=47-world-pixel local bend fits the 50+ source-pixel lateral visibility margin. The virtual bend pivot is below the crater; the influence map independently pins the real base. Manual patch and rim contours require visual review."},
  };
}
