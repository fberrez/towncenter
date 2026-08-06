import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "w-full min-w-0 rounded-[10px] border border-border-2 bg-surface-1 px-[13px] py-[11px] text-[15px] text-text-1 transition-colors outline-none placeholder:text-text-3 focus-visible:border-[var(--focus)] focus-visible:ring-3 focus-visible:ring-[var(--accent-veil)] disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-failure aria-invalid:ring-3 aria-invalid:ring-[color-mix(in_oklch,var(--failure)_20%,transparent)]",
        className
      )}
      {...props}
    />
  )
}

export { Input }
