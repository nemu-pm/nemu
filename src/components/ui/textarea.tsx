import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        // Glassmorphism styling
        "input-nemu",
        // Layout (preserved from original)
        "rounded-md px-2.5 py-2 flex field-sizing-content min-h-16 w-full outline-none",
        // Typography
        "text-base md:text-sm",
        "placeholder:text-muted-foreground",
        // Disabled state
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
