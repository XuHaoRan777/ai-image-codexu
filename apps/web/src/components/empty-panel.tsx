import type { LucideIcon } from "lucide-react"

export function EmptyPanel({
  description,
  icon: Icon,
  title,
}: {
  description?: string
  icon: LucideIcon
  title: string
}) {
  return (
    <div className="grid min-h-48 place-content-center justify-items-center rounded-lg border border-dashed border-border/70 px-5 py-10 text-center">
      <div className="flex size-11 items-center justify-center rounded-lg border border-border/80 bg-background/25 text-muted-foreground">
        <Icon className="size-5" />
      </div>
      <p className="mt-3 text-sm font-medium">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      ) : null}
    </div>
  )
}
