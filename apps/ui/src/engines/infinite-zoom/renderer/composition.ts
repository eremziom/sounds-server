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

/** Flatten at most three worlds into one renderer, retaining every ancestor
 * aperture. Independent camera responses are evaluated in each parent's space. */
export function compositionDraws(composition: SceneComposition, pose: CameraPose) {
  const draws: { id: string; placement: ArtworkPlacement; portals: readonly PortalRegion[] }[] = [];
  function visit(node: SceneComposition, localPose: CameraPose, parent: ArtworkPlacement, portals: readonly PortalRegion[]) {
    if (draws.length >= 3 || draws.some(draw => draw.id === node.sourceId)) throw new Error("Invalid bounded artwork composition");
    draws.push({ id: node.sourceId, placement: parent, portals });
    if (!node.destinationId) return;
    if (!node.placement || !node.portal) throw new Error("Missing portal placement");
    const localPlacement = destinationRenderPlacement(localPose, node.placement, node.destinationCamera);
    const center = placePoint(node.portal, parent);
    const portal = { ...node.portal, ...center, radiusX: node.portal.radiusX * parent.scale,
      radiusY: node.portal.radiusY * parent.scale, rotation: node.portal.rotation + parent.rotation };
    const next = node.destinationComposition ?? { sourceId: node.destinationId };
    if (next.sourceId !== node.destinationId) throw new Error("Mismatched nested artwork");
    visit(next, destinationView(localPose, node.placement, node.destinationCamera), composePlacement(parent, localPlacement), [...portals, portal]);
  }
  visit(composition, pose, IDENTITY_PLACEMENT, []);
  return draws;
}
