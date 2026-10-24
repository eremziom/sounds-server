import { requireRoles } from "@/lib/auth";
import { APP_ROLES } from "@/lib/route-access";

export default async function Home() {
  await requireRoles(APP_ROLES);
  return (
    <main className="p-6">
      <h1>Strona główna aplikacji Sounds</h1>
    </main>
  );
}
