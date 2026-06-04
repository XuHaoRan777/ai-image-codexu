export type ToastVariant = "success" | "warning" | "error" | "info"

export type ToastItem = {
  id: number
  message: string
  variant: ToastVariant
}

type ToastOptions = {
  duration?: number
}

let nextToastId = 0
let currentToasts: ToastItem[] = []
const listeners = new Set<(items: ToastItem[]) => void>()

function publishToasts() {
  const items = [...currentToasts]

  listeners.forEach((listener) => listener(items))
}

export function subscribeToasts(listener: (items: ToastItem[]) => void) {
  listeners.add(listener)
  listener([...currentToasts])

  return () => {
    listeners.delete(listener)
  }
}

export function dismissToast(id: number) {
  currentToasts = currentToasts.filter((item) => item.id !== id)
  publishToasts()
}

function showToast(
  variant: ToastVariant,
  message: string,
  { duration = 3600 }: ToastOptions = {},
) {
  nextToastId += 1

  const id = nextToastId

  currentToasts = [...currentToasts, { id, message, variant }].slice(-4)
  publishToasts()

  if (duration > 0) {
    window.setTimeout(() => dismissToast(id), duration)
  }

  return id
}

export const toast = {
  success: (message: string, options?: ToastOptions) =>
    showToast("success", message, options),
  warning: (message: string, options?: ToastOptions) =>
    showToast("warning", message, options),
  error: (message: string, options?: ToastOptions) =>
    showToast("error", message, options),
  info: (message: string, options?: ToastOptions) =>
    showToast("info", message, options),
  dismiss: dismissToast,
}
