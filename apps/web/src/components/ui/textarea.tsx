import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-20 w-full rounded-lg border border-input bg-background/45 px-3 py-2.5 text-base transition-[border-color,background-color,box-shadow] outline-none placeholder:text-muted-foreground/75 hover:border-foreground/20 focus-visible:border-ring focus-visible:bg-background/70 focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:border-border/60 disabled:bg-muted/35 disabled:text-muted-foreground disabled:opacity-100 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
