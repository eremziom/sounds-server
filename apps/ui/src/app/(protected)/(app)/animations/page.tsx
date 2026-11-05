import { requireRoles } from "@/lib/auth";
import { APP_ROLES } from "@/lib/route-access";
import { InfiniteZoomControls } from "@/components/infinite-zoom/infinite-zoom-controls";

export default async function AnimationsPage() {
  await requireRoles(APP_ROLES);
  return <main className="py-6"><InfiniteZoomControls /></main>;
}
