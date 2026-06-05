import { useEffect, useState } from "react"
import {
  CheckCircle2,
  CircleAlert,
  CircleX,
  Info,
  X,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import {
  dismissToast,
  subscribeToasts,
  type ToastItem,
  type ToastVariant,
} from "@/lib/toast"

const toastIcons: Record<ToastVariant, LucideIcon> = {
  success: CheckCircle2,
  warning: CircleAlert,
  error: CircleX,
  info: Info,
}

const toastLabels: Record<ToastVariant, string> = {
  success: "成功",
  warning: "警告",
  error: "错误",
  info: "提示",
}

const toastClassNames: Record<ToastVariant, string> = {
  success: "border-emerald-300/35 bg-emerald-300/12 text-emerald-50",
  warning: "border-amber-300/40 bg-amber-300/12 text-amber-50",
  error: "border-red-300/45 bg-red-400/12 text-red-50",
  info: "border-slate-300/35 bg-slate-300/12 text-slate-50",
}

const toastIconClassNames: Record<ToastVariant, string> = {
  success: "text-emerald-200",
  warning: "text-amber-200",
  error: "text-red-200",
  info: "text-slate-200",
}

export function GlobalToast() {
  const [items, setItems] = useState<ToastItem[]>([])

  useEffect(() => {
    return subscribeToasts(setItems)
  }, [])

  if (items.length === 0) {
    return null
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[70] flex justify-center px-4 sm:top-5">
      <div className="grid w-full max-w-md gap-2">
        {items.map((item) => (
          <ToastCard
            key={item.id}
            item={item}
            onDismiss={() => dismissToast(item.id)}
          />
        ))}
      </div>
    </div>
  )
}

function ToastCard({
  item,
  onDismiss,
}: {
  item: ToastItem
  onDismiss: () => void
}) {
  const Icon = toastIcons[item.variant]
  const urgent = item.variant === "error" || item.variant === "warning"

  return (
    <div
      role={urgent ? "alert" : "status"}
      aria-live={urgent ? "assertive" : "polite"}
      className={cn(
        "toast-card pointer-events-auto flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2 text-sm shadow-[0_18px_55px_rgba(0,0,0,0.28)] backdrop-blur-xl",
        item.leaving ? "toast-card-exit" : "toast-card-enter",
        toastClassNames[item.variant],
      )}
    >
      <Icon
        className={cn("size-4 shrink-0", toastIconClassNames[item.variant])}
      />
      <span className="sr-only">{toastLabels[item.variant]}：</span>
      <p className="min-w-0 flex-1 leading-5">{item.message}</p>
      <button
        type="button"
        className="flex size-7 shrink-0 items-center justify-center rounded-md opacity-70 transition-opacity hover:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50"
        onClick={onDismiss}
        aria-label="关闭提示"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}
