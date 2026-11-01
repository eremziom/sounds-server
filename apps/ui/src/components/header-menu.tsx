"use client";

import { useActionState, useRef, useState } from "react";
import { ChevronDownIcon, LogOutIcon } from "lucide-react";
import { logoutAction } from "../app/(auth)/actions";
import { notifyLogout } from "../lib/logout-event";
import { Button } from "./ui/button";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "./ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

export function HeaderMenu({ username, menuLabels, logoutLabel, logoutPendingLabel, logoutConfirmation }: {
  username: string;
  menuLabels: { profile: string; settings: string; workshop: string };
  logoutLabel: string;
  logoutPendingLabel: string;
  logoutConfirmation: { title: string; description: string; cancel: string };
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [, action, pending] = useActionState(logoutAction, undefined);
  return (
    <>
      <form ref={formRef} action={action} onSubmitCapture={notifyLogout} hidden data-user-menu-logout />
      <DropdownMenu>
        <DropdownMenuTrigger ref={triggerRef} disabled={pending} render={<Button variant="ghost" className="header-menu-trigger min-h-10 px-3 py-2" style={{ backgroundColor: "transparent" }} />}>
          {username}
          <ChevronDownIcon aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={8}>
          <DropdownMenuItem>{menuLabels.profile}</DropdownMenuItem>
          <DropdownMenuItem>{menuLabels.settings}</DropdownMenuItem>
          <DropdownMenuItem>{menuLabels.workshop}</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={pending} onClick={() => setConfirmOpen(true)} data-user-menu-logout-item>
            <LogOutIcon aria-hidden="true" />
            {logoutLabel}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirmOpen} onOpenChange={(open) => { if (!pending) setConfirmOpen(open); }}>
        <AlertDialogContent initialFocus={cancelRef} finalFocus={triggerRef} aria-busy={pending}>
          <AlertDialogHeader>
            <AlertDialogTitle>{logoutConfirmation.title}</AlertDialogTitle>
            <AlertDialogDescription>{logoutConfirmation.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel ref={cancelRef} disabled={pending}>{logoutConfirmation.cancel}</AlertDialogCancel>
            <AlertDialogAction disabled={pending} onClick={() => formRef.current?.requestSubmit()}>
              {pending ? logoutPendingLabel : logoutLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {pending ? logoutPendingLabel : ""}
      </p>
    </>
  );
}
