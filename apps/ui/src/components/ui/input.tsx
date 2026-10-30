import * as React from "react"
import { Quantico } from "next/font/google"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "cn"

const quantico = Quantico({
  weight: ["400", "700"],
  subsets: ["latin"],
  preload: false,
})

type InputProps = React.ComponentProps<"input"> & {
  variant?: "default" | "auth"
}

function Input({ className, type, variant = "default", ...props }: InputProps) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      data-variant={variant}
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        variant === "auth" && [
          quantico.className,
          "cursor-default border-fuchsia-700 bg-fuchsia-900 text-fuchsia-50 caret-fuchsia-50 placeholder:text-fuchsia-300",
          "focus:border-fuchsia-400 focus-visible:border-fuchsia-400 focus-visible:ring-2 focus-visible:ring-fuchsia-400/40",
          "disabled:bg-fuchsia-950 disabled:text-fuchsia-300 dark:bg-fuchsia-900 dark:disabled:bg-fuchsia-950",
          "autofill:inset-shadow-[0_0_0_1000px_var(--color-fuchsia-900)] autofill:[-webkit-text-fill-color:var(--color-fuchsia-50)] autofill:caret-fuchsia-50",
          "aria-invalid:focus:border-destructive aria-invalid:focus-visible:border-destructive aria-invalid:focus-visible:ring-destructive/20 dark:aria-invalid:focus-visible:ring-destructive/40",
        ],
        className
      )}
      {...props}
    />
  )
}

export { Input }
