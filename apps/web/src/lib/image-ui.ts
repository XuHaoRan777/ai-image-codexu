import type {
  AssistantProviderMode,
  AspectRatio,
  ImageJobStatus,
  ImageProviderType,
  ImageResolution,
} from "@ai-image-codexu/shared"

export type AssistantFormState = {
  mode: AssistantProviderMode
  baseUrl: string
  apiKey: string
  modelName: string
  enabled: boolean
}

export const assistantModeLabels: Record<AssistantProviderMode, string> = {
  openai: "OpenAI 模式",
  claude: "Claude 模式",
}

export const providerTypeLabels: Record<ImageProviderType, string> = {
  openai: "OpenAI 官方",
  google: "Google Gemini",
  onetopai: "OneTopAI",
  "image-youyu": "image-youyu",
}

export const providerDefaultModelNames: Record<ImageProviderType, string> = {
  openai: "gpt-image-2",
  google: "gemini-3.1-flash-image",
  onetopai: "gpt-image-2",
  "image-youyu": "image-youyu",
}

export type ReferenceImage = {
  id: string
  name: string
  dataUrl: string
}

export const aspectRatioLabels: Record<AspectRatio, string> = {
  auto: "自适应",
  "1:1": "1:1",
  "4:3": "4:3",
  "3:4": "3:4",
  "16:9": "16:9",
  "9:16": "9:16",
}

export const resolutionLabels: Record<ImageResolution, string> = {
  "0.5k": "0.5k",
  "1k": "1k",
  "2k": "2k",
  "4k": "4k",
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
