"use client";

import { useActionState, useRef } from "react";
import { ChevronDownIcon, LogOutIcon } from "lucide-react";
import { logoutAction } from "../app/(auth)/actions";
import { notifyLogout } from "../lib/logout-event";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

export function HeaderMenu({ username, menuLabels, logoutLabel, logoutPendingLabel }: {
  username: string;
  menuLabels: { profile: string; settings: string; workshop: string };
  logoutLabel: string;
  logoutPendingLabel: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [, action, pending] = useActionState(logoutAction, undefined);
  return (
    <>
      <form ref={formRef} action={action} onSubmitCapture={notifyLogout} hidden data-user-menu-logout />
      <DropdownMenu>
        <DropdownMenuTrigger disabled={pending} render={<Button variant="ghost" className="min-h-10 px-3 py-2" style={{ backgroundColor: "transparent" }} />}>
          {username}
          <ChevronDownIcon aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={8}>
          <DropdownMenuItem>{menuLabels.profile}</DropdownMenuItem>
          <DropdownMenuItem>{menuLabels.settings}</DropdownMenuItem>
          <DropdownMenuItem>{menuLabels.workshop}</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={pending} onClick={() => formRef.current?.requestSubmit()} data-user-menu-logout-item>
            <LogOutIcon aria-hidden="true" />
            {logoutLabel}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {pending ? logoutPendingLabel : ""}
      </p>
    </>
  );
}
