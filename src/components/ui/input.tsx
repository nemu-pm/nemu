import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        // Glassmorphism styling
        "input-nemu",
        // Layout (preserved from original)
        "h-9 rounded-md px-2.5 py-1 w-full min-w-0 outline-none",
        // Typography
        "text-base md:text-sm select-text",
        "placeholder:text-muted-foreground",
        // File input styling
        "file:h-7 file:text-sm file:font-medium file:text-foreground",
        "file:inline-flex file:border-0 file:bg-transparent",
        // Disabled state
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Input }
