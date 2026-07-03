import type {
  AssistantProviderMode,
  AspectRatio,
  ImageJob,
  ImageJobStatus,
  ImageProviderDeliveryMode,
  ImageProviderType,
  ImageResolution,
} from "@ai-image-codexu/shared"
import { ImageProviderTypeEnum } from "@ai-image-codexu/shared"

export type AssistantFormState = {
  mode: AssistantProviderMode
  url: string
  apiKey: string
  modelName: string
  enabled: boolean
}

export const assistantModeLabels: Record<AssistantProviderMode, string> = {
  openai: "OpenAI 模式",
  claude: "Claude 模式",
}

export const providerTypeLabels: Record<ImageProviderType, string> = {
  [ImageProviderTypeEnum.ConfigurableHttp]: "Configurable HTTP",
  [ImageProviderTypeEnum.OpenAICompatible]: "OpenAI-compatible",
  [ImageProviderTypeEnum.GoogleCompatible]: "Google-compatible",
}

export const providerDefaultModelNames: Record<ImageProviderType, string> = {
  [ImageProviderTypeEnum.ConfigurableHttp]: "",
  [ImageProviderTypeEnum.OpenAICompatible]: "gpt-image-2",
  [ImageProviderTypeEnum.GoogleCompatible]: "gemini-3.1-flash-image",
}

export const providerDeliveryModeLabels: Record<ImageProviderDeliveryMode, string> = {
  sync: "同步返回",
  polling: "任务轮询",
}

export type ReferenceImage = {
  id: string
  name: string
  dataUrl: string
}

export const aspectRatioLabels: Record<string, string> = {
  auto: "自适应",
  "1:1": "1:1",
  "4:3": "4:3",
  "3:4": "3:4",
  "16:9": "16:9",
  "9:16": "9:16",
}

export const resolutionLabels: Record<string, string> = {
  "0.5k": "0.5k",
  "1k": "1k",
  "2k": "2k",
  "4k": "4k",
}

export function formatAspectRatioLabel(value: AspectRatio) {
  return aspectRatioLabels[value] ?? value
}

export function formatResolutionLabel(value: ImageResolution) {
  return resolutionLabels[value] ?? value
}

export const statusLabels: Record<ImageJobStatus, string> = {
  queued: "排队中",
  running: "生成中",
  succeeded: "已完成",
  failed: "失败",
  canceled: "已取消",
}

export const statusToneClassNames: Record<ImageJobStatus, string> = {
  queued: "border-cyan-300/35 bg-cyan-300/10 text-cyan-100",
  running: "border-amber-300/40 bg-amber-300/10 text-amber-100",
  succeeded: "border-emerald-300/40 bg-emerald-300/10 text-emerald-100",
  failed: "border-red-300/45 bg-red-400/10 text-red-100",
  canceled: "border-slate-300/35 bg-slate-300/10 text-slate-100",
}

export function formatShortTime(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return "刚刚"
  }

  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

/** 判断生图任务是否仍占用当前单任务生成通道。 */
export function isImageJobActive(job?: Pick<ImageJob, "status"> | null) {
  return job?.status === "queued" || job?.status === "running"
}

/** 从任务记录中提取可查看的生成图列表，并兼容旧的单图字段。 */
export function getImageJobUrls(
  job?: Pick<ImageJob, "imageUrl" | "imageUrls"> | null,
) {
  if (!job) {
    return []
  }

  if (job.imageUrls && job.imageUrls.length > 0) {
    return job.imageUrls
  }

  return job.imageUrl ? [job.imageUrl] : []
}

/** 格式化任务已经等待的时间，用于生成中的紧凑状态反馈。 */
export function formatElapsedTime(value: string, now = Date.now()) {
  const startedAt = new Date(value).getTime()

  if (Number.isNaN(startedAt)) {
    return "刚刚"
  }

  const elapsedSeconds = Math.max(0, Math.floor((now - startedAt) / 1000))

  if (elapsedSeconds < 60) {
    return `${elapsedSeconds} 秒`
  }

  const minutes = Math.floor(elapsedSeconds / 60)
  const seconds = elapsedSeconds % 60

  return `${minutes} 分 ${seconds.toString().padStart(2, "0")} 秒`
}
