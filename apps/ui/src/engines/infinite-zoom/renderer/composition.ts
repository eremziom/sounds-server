import type { CameraPose } from "../camera/camera-math.ts";
import { destinationRenderPlacement, destinationView, type DestinationCamera } from "../transition/destination-view.ts";
import { IDENTITY_PLACEMENT, placePoint, type ArtworkPlacement } from "../transition/placement.ts";
import type { PortalRegion } from "../transition/portal.ts";

export interface SceneComposition {
  readonly sourceId: string;
  readonly destinationId?: string;
  readonly placement?: ArtworkPlacement;
  readonly portal?: PortalRegion;
  readonly destinationCamera?: DestinationCamera;
  readonly destinationComposition?: SceneComposition;
}

/** Similarity composition P_parent * P_child with an explicit child anchor. */
export function composePlacement(parent: ArtworkPlacement, child: ArtworkPlacement): ArtworkPlacement {
  const point = placePoint({ x: child.x, y: child.y }, parent);
  return { ...child, ...point, rotation: parent.rotation + child.rotation, scale: parent.scale * child.scale };
}

/** Flatten at most six placements of the three cached worlds into one renderer, retaining every ancestor
 * aperture. Independent camera responses are evaluated in each parent's space. */
export function compositionDraws(composition: SceneComposition, pose: CameraPose) {
  const draws: { id: string; placement: ArtworkPlacement; portals: readonly PortalRegion[]; view: CameraPose }[] = [];
  function visit(node: SceneComposition, localPose: CameraPose, parent: ArtworkPlacement, portals: readonly PortalRegion[]) {
    if (draws.length >= 6) throw new Error("Invalid bounded artwork composition");
    draws.push({ id: node.sourceId, placement: parent, portals, view:localPose });
    if (!node.destinationId) return;
    if (!node.placement || !node.portal) throw new Error("Missing portal placement");
    // Deep embedded copies can be smaller than the journey camera's -8 limit.
    // Their virtual views are render coordinates, never controller commands.
    const p = node.placement, rawScale = localPose.logScale + Math.log(p.scale);
    let childPose: CameraPose;
    if (rawScale < -8) {
      const c = Math.cos(p.rotation), s = Math.sin(p.rotation), x = localPose.x - p.x, y = localPose.y - p.y;
      childPose = { x: p.anchorX + (c*x+s*y)/p.scale, y: p.anchorY + (-s*x+c*y)/p.scale,
        rotation: localPose.rotation-p.rotation, logScale: rawScale };
    } else childPose = destinationView(localPose, p, node.destinationCamera);
    const localPlacement = rawScale < -8 ? p : destinationRenderPlacement(localPose, p, node.destinationCamera);
    const center = placePoint(node.portal, parent);
    const portal = { ...node.portal, ...center, radiusX: node.portal.radiusX * parent.scale,
      radiusY: node.portal.radiusY * parent.scale, rotation: node.portal.rotation + parent.rotation };
    const next = node.destinationComposition ?? { sourceId: node.destinationId };
    if (next.sourceId !== node.destinationId) throw new Error("Mismatched nested artwork");
    visit(next, childPose, composePlacement(parent, localPlacement), [...portals, portal]);
  }
  visit(composition, pose, IDENTITY_PLACEMENT, []);
  return draws;
}
