"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { Eye, House, KeyRound, LibraryBig } from "lucide-react";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import { ProtectedLink } from "./protected-link";

export type ApplicationNavigationLabels = {
  label: string;
  home: string;
  library: string;
  animations: string;
  admin: string;
};

// The root layout owns this permanent header slot. Rendering through a portal
// keeps the navigation inside the protected runtime's session context.
const subscribe = () => () => {};
const getHeaderSlot = () => document.getElementById("application-navigation");
const getServerSlot = () => null;
const navigationLinkStyle = navigationMenuTriggerStyle({
  className: "application-navigation-link bg-transparent hover:bg-transparent focus:bg-transparent data-active:bg-transparent data-active:hover:bg-transparent data-active:focus:bg-transparent",
});

export function ApplicationNavigation({ labels }: { labels: ApplicationNavigationLabels }) {
  const pathname = usePathname();
  const slot = useSyncExternalStore(subscribe, getHeaderSlot, getServerSlot);
  if (!slot) return null;

  return createPortal(
    <NavigationMenu aria-label={labels.label}>
      <NavigationMenuList className="flex-wrap justify-start">
        <NavigationMenuItem>
          <NavigationMenuLink render={<ProtectedLink href="/" />} active={pathname === "/"} className={navigationLinkStyle}>
            <House aria-hidden="true" className="size-4 shrink-0" />
            {labels.home}
          </NavigationMenuLink>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuLink aria-disabled="true" tabIndex={-1} className={`${navigationLinkStyle} pointer-events-none opacity-50`}>
            <LibraryBig aria-hidden="true" className="size-4 shrink-0" />
            {labels.library}
          </NavigationMenuLink>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuLink aria-disabled="true" tabIndex={-1} className={`${navigationLinkStyle} pointer-events-none opacity-50`}>
            <Eye aria-hidden="true" className="size-4 shrink-0" />
            {labels.animations}
          </NavigationMenuLink>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuLink render={<ProtectedLink href="/admin" />} active={pathname === "/admin" || pathname.startsWith("/admin/")} className={navigationLinkStyle}>
            <KeyRound aria-hidden="true" className="size-4 shrink-0" />
            {labels.admin}
          </NavigationMenuLink>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>,
    slot,
  );
}
