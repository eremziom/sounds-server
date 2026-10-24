import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Brak dostępu | Sounds" };

export default function AccessDeniedPage() {
  return (
    <main className="space-y-4 p-6">
      <h1 className="text-3xl font-semibold">Brak dostępu</h1>
      <p>Twoje konto nie ma wymaganej roli, aby otworzyć tę stronę.</p>
      <Link href="/login" className="underline underline-offset-4">
        Przejdź do logowania
      </Link>
    </main>
  );
}
