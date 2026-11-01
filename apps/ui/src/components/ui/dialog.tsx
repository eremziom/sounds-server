"use client";

import type { ComponentProps } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "cn";
import { Button } from "./button";

// Keep Base UI's generic root intact for controlled dialogs and detached triggers.
const Dialog = DialogPrimitive.Root;

function DialogTrigger(props: ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal(props: ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal {...props} />;
}

function DialogClose(props: ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({ className, ...props }: ComponentProps<typeof DialogPrimitive.Backdrop>) {
  return (
    <DialogPrimitive.Backdrop data-slot="dialog-overlay"
      className={cn("fixed inset-0 z-50 bg-black/60 transition-opacity duration-150 data-starting-style:opacity-0 data-ending-style:opacity-0 motion-reduce:transition-none", className)}
      {...props} />
  );
}

function DialogContent({ className, children, showCloseButton = true, ...props }:
  ComponentProps<typeof DialogPrimitive.Popup> & { showCloseButton?: boolean }) {
  const t = useTranslations("common.actions");
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup data-slot="dialog-content"
        className={cn("fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-xl border bg-popover p-6 text-popover-foreground shadow-lg outline-none transition-[opacity,scale] duration-150 data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0 motion-reduce:transition-none", className)}
        {...props}>
        {children}
        {showCloseButton && (
          <DialogClose render={<Button variant="ghost" size="icon-sm" />} className="absolute top-3 right-3" aria-label={t("close")}>
            <XIcon aria-hidden="true" />
          </DialogClose>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="dialog-header" className={cn("flex flex-col gap-2 pr-6", className)} {...props} />;
}

function DialogFooter({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="dialog-footer" className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)} {...props} />;
}

function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title data-slot="dialog-title" className={cn("text-base leading-snug font-semibold", className)} {...props} />;
}

function DialogDescription({ className, ...props }: ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description data-slot="dialog-description" className={cn("text-sm leading-relaxed text-muted-foreground", className)} {...props} />;
}

export {
  Dialog, DialogTrigger, DialogPortal, DialogClose, DialogOverlay,
  DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription,
};
