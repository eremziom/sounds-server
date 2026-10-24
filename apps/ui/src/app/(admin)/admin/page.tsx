import type { Metadata } from "next";
import Link from "next/link";
import { requireRoles } from "@/lib/auth";
import { ADMIN_ROLES } from "@/lib/route-access";

export const metadata: Metadata = {
  title: "Panel administracyjny | Sounds",
};

export default async function AdminPage() {
  await requireRoles(ADMIN_ROLES);
  return (
    <main className="space-y-4 p-6">
      <h1 className="text-3xl font-semibold">Panel administracyjny</h1>
      <p className="text-muted-foreground">
        Tutaj pojawią się narzędzia do zarządzania aplikacją.
      </p>
      <Link href="/" className="inline-block underline underline-offset-4">
        Wróć na stronę główną
      </Link>
    </main>
  );
}
