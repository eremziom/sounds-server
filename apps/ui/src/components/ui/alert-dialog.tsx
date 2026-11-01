"use client";

import type { ComponentProps } from "react";
import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";
import { cn } from "cn";
import { Button } from "./button";

const AlertDialog = AlertDialogPrimitive.Root;

function AlertDialogTrigger(props: ComponentProps<typeof AlertDialogPrimitive.Trigger>) {
  return <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />;
}

function AlertDialogPortal(props: ComponentProps<typeof AlertDialogPrimitive.Portal>) {
  return <AlertDialogPrimitive.Portal {...props} />;
}

function AlertDialogOverlay({ className, ...props }: ComponentProps<typeof AlertDialogPrimitive.Backdrop>) {
  return (
    <AlertDialogPrimitive.Backdrop data-slot="alert-dialog-overlay"
      className={cn("fixed inset-0 z-50 bg-black/60 transition-opacity duration-150 data-starting-style:opacity-0 data-ending-style:opacity-0 motion-reduce:transition-none", className)}
      {...props} />
  );
}

function AlertDialogContent({ className, ...props }: ComponentProps<typeof AlertDialogPrimitive.Popup>) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Popup data-slot="alert-dialog-content"
        className={cn("fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-xl border bg-popover p-6 text-popover-foreground shadow-lg outline-none transition-[opacity,scale] duration-150 data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0 motion-reduce:transition-none", className)}
        {...props} />
    </AlertDialogPortal>
  );
}

function AlertDialogHeader({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="alert-dialog-header" className={cn("flex flex-col gap-2", className)} {...props} />;
}

function AlertDialogFooter({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="alert-dialog-footer" className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)} {...props} />;
}

function AlertDialogTitle({ className, ...props }: ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return <AlertDialogPrimitive.Title data-slot="alert-dialog-title" className={cn("text-base leading-snug font-semibold", className)} {...props} />;
}

function AlertDialogDescription({ className, ...props }: ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return <AlertDialogPrimitive.Description data-slot="alert-dialog-description" className={cn("text-sm leading-relaxed text-muted-foreground", className)} {...props} />;
}

function AlertDialogCancel(props: ComponentProps<typeof AlertDialogPrimitive.Close>) {
  return <AlertDialogPrimitive.Close data-slot="alert-dialog-cancel" render={<Button variant="outline" />} {...props} />;
}

// Actions stay open until the caller confirms success and closes the controlled
// root. This also supports form submission and displaying request errors inline.
function AlertDialogAction(props: ComponentProps<typeof Button>) {
  return <Button data-slot="alert-dialog-action" {...props} />;
}

export {
  AlertDialog, AlertDialogTrigger, AlertDialogPortal, AlertDialogOverlay,
  AlertDialogContent, AlertDialogHeader, AlertDialogFooter, AlertDialogTitle,
  AlertDialogDescription, AlertDialogCancel, AlertDialogAction,
};
