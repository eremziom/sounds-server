"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, type ComponentProps } from "react";
import { useApplicationSession } from "./application-runtime";

type ProtectedLinkProps = Omit<ComponentProps<typeof Link>, "href" | "onNavigate" | "prefetch"> & {
  href: `/${string}`;
};

// Disable prefetch so the protected RSC request cannot bypass the session check.
// Modified clicks/new tabs retain Link's normal browser behavior and server guards.
export function ProtectedLink({ href, replace, scroll, ...props }: ProtectedLinkProps) {
  const router = useRouter();
  const { runProtected } = useApplicationSession();

  return (
    <Link {...props} href={href} replace={replace} scroll={scroll} prefetch={false}
      onNavigate={(event) => {
        event.preventDefault();
        startTransition(async () => {
          await runProtected(() => {
            if (replace) router.replace(href, { scroll });
            else router.push(href, { scroll });
          });
        });
      }}
    />
  );
}
