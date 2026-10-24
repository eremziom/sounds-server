import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Logowanie | Sounds",
};

export default function LoginPage() {
  return (
    <section className="space-y-4">
      <h1 className="text-3xl font-semibold">Logowanie</h1>
      <p className="text-muted-foreground">
        Tutaj pojawi się formularz logowania.
      </p>
      <p>
        Nie masz konta?{" "}
        <Link href="/register" className="underline underline-offset-4">
          Zarejestruj się
        </Link>
      </p>
      <Link href="/" className="inline-block underline underline-offset-4">
        Wróć na stronę główną
      </Link>
    </section>
  );
}
