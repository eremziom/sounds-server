"use client";

import { useFormStatus } from "react-dom";
import { logoutAction, logoutAllAction } from "../../app/(auth)/actions";
import { Button } from "../ui/button";
import { notifyLogout } from "../../lib/logout-event";

type LogoutLabels = {
  action: string;
  pending: string;
  all: string;
  canLogoutAll: boolean;
};

function LogoutButtons({ action, pending: pendingLabel, all, canLogoutAll }: LogoutLabels) {
  const { pending, action: pendingAction } = useFormStatus();
  const allSelected = pendingAction === logoutAllAction;
  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-2" aria-busy={pending}>
        <Button type="submit" data-logout-scope="current" formAction={logoutAction} disabled={pending}
          variant="outline" className="h-auto min-h-10 whitespace-normal px-3 py-2">
          {pending && !allSelected ? pendingLabel : action}
        </Button>
        {canLogoutAll && (
          <Button type="submit" data-logout-scope="all" formAction={logoutAllAction}
            disabled={pending} variant="ghost" className="h-auto min-h-10 whitespace-normal px-3 py-2">
            {pending && allSelected ? pendingLabel : all}
          </Button>
        )}
      </div>
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {pending ? pendingLabel : ""}
      </p>
    </>
  );
}

export function LogoutControls(props: LogoutLabels) {
  return (
    <form action={logoutAction} onSubmitCapture={notifyLogout} aria-label={props.action} data-auth-logout>
      <LogoutButtons {...props} />
    </form>
  );
}
