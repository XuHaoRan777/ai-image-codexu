export type ToastVariant = "success" | "warning" | "error" | "info"

export type ToastItem = {
  id: number
  leaving?: boolean
  message: string
  variant: ToastVariant
}

type ToastOptions = {
  duration?: number
}

let nextToastId = 0
let currentToasts: ToastItem[] = []
const listeners = new Set<(items: ToastItem[]) => void>()
const exitDuration = 280
const toastTimers = new Map<number, number>()

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
  const toastItem = currentToasts.find((item) => item.id === id)

  if (!toastItem) {
    return
  }

  if (toastItem.leaving) {
    return
  }

  const existingTimer = toastTimers.get(id)

  if (existingTimer !== undefined) {
    window.clearTimeout(existingTimer)
    toastTimers.delete(id)
  }

  currentToasts = currentToasts.map((item) =>
    item.id === id ? { ...item, leaving: true } : item,
  )
  publishToasts()

  const removeTimer = window.setTimeout(() => removeToast(id), exitDuration)
  toastTimers.set(id, removeTimer)
}

function removeToast(id: number) {
  const existingTimer = toastTimers.get(id)

  if (existingTimer !== undefined) {
    window.clearTimeout(existingTimer)
    toastTimers.delete(id)
  }

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

  currentToasts = [...currentToasts, { id, message, variant }]

  while (currentToasts.filter((item) => !item.leaving).length > 4) {
    const oldestVisibleToast = currentToasts.find((item) => !item.leaving)

    if (!oldestVisibleToast) {
      break
    }

    removeToast(oldestVisibleToast.id)
  }

  publishToasts()

  if (duration > 0) {
    toastTimers.set(id, window.setTimeout(() => dismissToast(id), duration))
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
