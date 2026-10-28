import { Suspense, type ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { ApplicationRuntime } from "@/components/application/application-runtime";
import Loading from "@/app/loading";

async function AuthenticatedRuntime({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Changing accounts intentionally resets media. Navigation, locale changes and
  // replacement of token cookies for the same account must preserve the runtime.
  // Section/page guards still perform their own current role checks.
  return <ApplicationRuntime key={user.id}>{children}</ApplicationRuntime>;
}

export default function ProtectedLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<Loading />}>
      <AuthenticatedRuntime>{children}</AuthenticatedRuntime>
    </Suspense>
  );
}
