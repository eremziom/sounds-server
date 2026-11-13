import { requireRoles } from "@/lib/auth";
import { APP_ROLES } from "@/lib/route-access";
import { ArtworkCreator } from "@/components/artwork-creator/artwork-creator";
import { ClientMessages } from "@/i18n/client-messages";

export default async function ArtworkCreatorPage() {
  await requireRoles(APP_ROLES);
  return <main className="py-6"><ClientMessages namespaces={["app"]}><ArtworkCreator /></ClientMessages></main>;
}
