import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Rejestracja | Sounds",
};

export default function RegisterPage() {
  return (
    <section className="space-y-4">
      <h1 className="text-3xl font-semibold">Rejestracja</h1>
      <p className="text-muted-foreground">
        Tutaj pojawi się formularz rejestracji.
      </p>
      <p>
        Masz już konto?{" "}
        <Link href="/login" className="underline underline-offset-4">
          Zaloguj się
        </Link>
      </p>
      <Link href="/" className="inline-block underline underline-offset-4">
        Wróć na stronę główną
      </Link>
    </section>
  );
}
