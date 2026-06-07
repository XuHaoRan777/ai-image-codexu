import { useEffect, useState, type ChangeEvent, type ReactNode } from "react"
import {
  aspectRatios,
  imageQuantities,
  imageResolutions,
  type AspectRatio,
  type ImageJob,
  type ImageModelConfig,
  type ImageQuantity,
  type ImageResolution,
} from "@ai-image-codexu/shared"
import {
  Expand,
  ImagePlus,
  Loader2,
  RefreshCw,
  Sparkles,
  Upload,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  aspectRatioLabels,
  formatElapsedTime,
  formatShortTime,
  getImageJobUrls,
  isImageJobActive,
  resolutionLabels,
  statusLabels,
  statusToneClassNames,
  type ReferenceImage,
} from "@/lib/image-ui"
import { toast } from "@/lib/toast"
import { cn } from "@/lib/utils"

const maxReferenceImages = 6

export function GeneratePage({
  aspectRatio,
  creatingJob,
  enabledConfigs,
  isGenerating,
  lastJob,
  optimizingPrompt,
  pollingJobId,
  prompt,
  quantity,
  referenceImages,
  resolution,
  selectedConfig,
  selectedConfigId,
  onAspectRatioChange,
  onCreateJob,
  onOptimizePrompt,
  onPromptChange,
  onQuantityChange,
  onReferenceImagesChange,
  onResolutionChange,
  onRetryJob,
  onSelectedConfigChange,
}: {
  aspectRatio: AspectRatio
  creatingJob: boolean
  enabledConfigs: ImageModelConfig[]
  isGenerating: boolean
  lastJob: ImageJob | null
  optimizingPrompt: boolean
  pollingJobId: string
  prompt: string
  quantity: ImageQuantity
  referenceImages: ReferenceImage[]
  resolution: ImageResolution
  selectedConfig?: ImageModelConfig
  selectedConfigId: string
  onAspectRatioChange: (value: AspectRatio) => void
  onCreateJob: () => void
  onOptimizePrompt: () => void
  onPromptChange: (value: string) => void
  onQuantityChange: (value: ImageQuantity) => void
  onReferenceImagesChange: (value: ReferenceImage[]) => void
  onResolutionChange: (value: ImageResolution) => void
  onRetryJob: () => void
  onSelectedConfigChange: (value: string) => void
}) {
  const generationControlsDisabled = isGenerating || optimizingPrompt

  return (
    <div className="motion-stagger grid min-w-0 gap-4 lg:min-h-0 lg:flex-1 xl:grid-cols-[minmax(340px,3.5fr)_minmax(0,6.5fr)]">
      <Card className="motion-panel surface-panel w-full min-w-0 rounded-lg lg:min-h-0">
        <CardHeader className="border-b border-border/70 pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ImagePlus className="size-5 text-emerald-200" />
            创作
          </CardTitle>
        </CardHeader>
        <CardContent className="motion-stagger grid gap-4 pt-1 lg:min-h-0 lg:overflow-y-auto lg:overflow-x-hidden">
          <ReferenceImagesField
            referenceImages={referenceImages}
            onReferenceImagesChange={onReferenceImagesChange}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <CompactSelectField
              description="预览比例。"
              id="aspect-ratio"
              label="尺寸"
            >
              <Select
                value={aspectRatio}
                onValueChange={(value) =>
                  onAspectRatioChange(value as AspectRatio)
                }
              >
                <SelectTrigger id="aspect-ratio" className="!h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {aspectRatios.map((value) => (
                    <SelectItem key={value} value={value}>
                      {aspectRatioLabels[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CompactSelectField>

            <CompactSelectField
              description="默认 1k。"
              id="resolution"
              label="分辨率"
            >
              <Select
                value={resolution}
                onValueChange={(value) =>
                  onResolutionChange(value as ImageResolution)
                }
              >
                <SelectTrigger id="resolution" className="!h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {imageResolutions.map((value) => (
                    <SelectItem key={value} value={value}>
                      {resolutionLabels[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CompactSelectField>

            <CompactSelectField
              description="输出张数。"
              id="quantity"
              label="数量"
            >
              <Select
                value={String(quantity)}
                onValueChange={(value) =>
                  onQuantityChange(Number(value) as ImageQuantity)
                }
              >
                <SelectTrigger id="quantity" className="!h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {imageQuantities.map((value) => (
                    <SelectItem key={value} value={String(value)}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CompactSelectField>
          </div>

          <div className="grid gap-2 lg:min-h-0">
            <div className="flex items-center justify-between gap-3">
              <FieldLabel id="prompt">提示词</FieldLabel>
              <Button
                className="h-9 border-emerald-300/25 bg-emerald-300/10 text-emerald-50 hover:bg-emerald-300/15"
                size="sm"
                variant="outline"
                disabled={optimizingPrompt || generationControlsDisabled}
                onClick={onOptimizePrompt}
              >
                {optimizingPrompt ? (
                  <Loader2 className="animate-spin" data-icon="inline-start" />
                ) : (
                  <Sparkles data-icon="inline-start" />
                )}
                优化提示词
              </Button>
            </div>
            <Textarea
              id="prompt"
              className="min-h-[240px] resize-y rounded-lg border-border/80 bg-background/55 px-4 py-3 text-base leading-7 shadow-inner shadow-black/20 placeholder:text-muted-foreground/70 focus-visible:ring-emerald-300/30 md:text-sm lg:h-[240px] lg:min-h-0"
              placeholder="描述你想生成的画面、主体、风格、构图、光线和限制条件。"
              value={prompt}
              onChange={(event) => onPromptChange(event.target.value)}
            />
          </div>

          <div className="motion-pop grid gap-3 rounded-lg border border-border/70 bg-background/45 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <Select
              value={selectedConfigId}
              onValueChange={onSelectedConfigChange}
            >
              <SelectTrigger className="!h-10 w-full min-w-0">
                <SelectValue placeholder="选择模型" />
              </SelectTrigger>
              <SelectContent>
                {enabledConfigs.map((config) => (
                  <SelectItem key={config.id} value={config.id}>
                    {config.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              className={cn(
                "h-10 w-full bg-primary text-primary-foreground shadow-[0_0_24px_rgba(52,211,153,0.18)] hover:bg-primary/90 sm:w-auto sm:shrink-0",
                generationControlsDisabled &&
                  !creatingJob &&
                  "bg-muted text-muted-foreground shadow-none hover:bg-muted disabled:opacity-60",
              )}
              disabled={generationControlsDisabled}
              onClick={onCreateJob}
            >
              {creatingJob ? (
                <Loader2 className="animate-spin" />
              ) : (
                <ImagePlus />
              )}
              创建生图任务
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="motion-panel surface-panel w-full min-w-0 rounded-lg lg:min-h-0">
        <CardHeader className="border-b border-border/70 pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ImagePlus className="size-5 text-amber-200" />
            任务预览
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 pt-1 lg:min-h-0 lg:flex-1 lg:grid-rows-[minmax(0,1fr)_auto]">
          <JobPreviewCanvas
            aspectRatio={aspectRatio}
            lastJob={lastJob}
            pollingJobId={pollingJobId}
            retryDisabled={optimizingPrompt}
            selectedConfig={selectedConfig}
            onRetryJob={onRetryJob}
          />
        </CardContent>
      </Card>
    </div>
  )
}

function JobPreviewCanvas({
  aspectRatio,
  lastJob,
  onRetryJob,
  pollingJobId,
  retryDisabled,
  selectedConfig,
}: {
  aspectRatio: AspectRatio
  lastJob: ImageJob | null
  onRetryJob: () => void
  pollingJobId: string
  retryDisabled: boolean
  selectedConfig?: ImageModelConfig
}) {
  const imageUrls = getImageJobUrls(lastJob)
  const [selectedImage, setSelectedImage] = useState({
    jobId: "",
    index: 0,
  })
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false)
  const [now, setNow] = useState(0)
  const activeImageIndex =
    selectedImage.jobId === lastJob?.id &&
    selectedImage.index < imageUrls.length
      ? selectedImage.index
      : 0
  const activeImageUrl = imageUrls[activeImageIndex] ?? imageUrls[0]
  const active = isImageJobActive(lastJob)

  useEffect(() => {
    if (!active) {
      return
    }

    const intervalId = window.setInterval(() => {
      setNow(Date.now())
    }, 1000)
    const timeoutId = window.setTimeout(() => {
      setNow(Date.now())
    }, 0)

    return () => {
      window.clearInterval(intervalId)
      window.clearTimeout(timeoutId)
    }
  }, [active])

  return (
    <>
      <div className="grid min-h-0 gap-3 lg:grid-rows-[minmax(0,1fr)_auto]">
        <div
          className={cn(
            "preview-frame motion-pop mx-auto flex w-full items-center justify-center overflow-hidden rounded-lg border border-border/75 transition-[max-width] duration-300 ease-out lg:max-h-full",
            getPreviewFrameClass(lastJob?.aspectRatio ?? aspectRatio),
          )}
        >
          {activeImageUrl ? (
            <button
              type="button"
              className="group/preview relative h-full w-full focus-visible:ring-3 focus-visible:ring-ring/50"
              onClick={() => setPreviewDialogOpen(true)}
              aria-label="放大查看生成结果"
            >
              <img
                src={activeImageUrl}
                alt="生成结果"
                loading="lazy"
                className="h-full w-full object-contain"
              />
              <span className="absolute right-3 top-3 flex size-9 items-center justify-center rounded-lg border border-white/20 bg-black/55 text-white opacity-0 shadow-lg backdrop-blur transition-opacity group-hover/preview:opacity-100 group-focus-visible/preview:opacity-100">
                <Expand className="size-4" />
              </span>
            </button>
          ) : active ? (
            <GeneratingPreviewState
              job={lastJob}
              now={now}
            />
          ) : (
            <IdlePreviewState
              job={lastJob}
              retryDisabled={Boolean(pollingJobId) || retryDisabled}
              onRetryJob={onRetryJob}
            />
          )}
        </div>

        {imageUrls.length > 1 ? (
          <div className="motion-pop flex min-h-16 gap-2 overflow-x-auto rounded-lg border border-border/70 bg-background/35 p-2">
            {imageUrls.map((url, index) => (
              <button
                key={`${url}-${index}`}
                type="button"
                className={cn(
                  "size-14 shrink-0 overflow-hidden rounded-md border bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50",
                  activeImageIndex === index
                    ? "border-emerald-300/70"
                    : "border-border/70 hover:border-emerald-300/35",
                )}
                onClick={() =>
                  setSelectedImage({ jobId: lastJob?.id ?? "", index })
                }
                aria-label={`查看第 ${index + 1} 张生成结果`}
              >
                <img
                  src={url}
                  alt={`生成结果 ${index + 1}`}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        ) : null}

        <JobPreviewFooter
          activeImageIndex={activeImageIndex}
          imageCount={imageUrls.length}
          lastJob={lastJob}
          selectedConfig={selectedConfig}
        />
      </div>

      <ImagePreviewDialog
        imageUrl={activeImageUrl}
        open={previewDialogOpen}
        onOpenChange={setPreviewDialogOpen}
      />
    </>
  )
}

function GeneratingPreviewState({
  job,
  now,
}: {
  job: ImageJob | null
  now: number
}) {
  return (
    <div className="preview-loading relative z-10 grid w-full max-w-md justify-items-center gap-6 px-5 text-center">
      <div className="preview-loading-ring">
        <Loader2 className="size-11 animate-spin text-emerald-100" />
      </div>
      <div className="grid gap-2">
        <p className="text-xs leading-5 text-muted-foreground">
          {job
            ? `${job.configName} · ${aspectRatioLabels[job.aspectRatio]} · ${resolutionLabels[job.resolution]} · ${job.quantity} 张 · 已等待 ${formatElapsedTime(job.createdAt, now)}`
            : "正在创建任务。"}
        </p>
      </div>
    </div>
  )
}

function IdlePreviewState({
  job,
  onRetryJob,
  retryDisabled,
}: {
  job: ImageJob | null
  onRetryJob: () => void
  retryDisabled: boolean
}) {
  const failed = job?.status === "failed"

  return (
    <div className="relative z-10 grid max-w-sm justify-items-center gap-3 px-4 text-center">
      <div
        className={cn(
          "flex size-12 items-center justify-center rounded-lg border",
          failed
            ? "border-red-300/30 bg-red-400/10 text-red-100"
            : "border-emerald-300/25 bg-emerald-300/10 text-emerald-100",
        )}
      >
        {failed ? (
          <RefreshCw className="size-5" />
        ) : (
          <ImagePlus className="size-5" />
        )}
      </div>
      <div>
        <p className="text-sm font-medium">
          {job ? statusLabels[job.status] : "画布待命"}
        </p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {job?.errorMessage ?? "创建任务后显示结果。"}
        </p>
      </div>
      {failed ? (
        <Button
          className="h-9 border-emerald-300/25 bg-emerald-300/10 text-emerald-50 hover:bg-emerald-300/15"
          size="sm"
          variant="outline"
          disabled={retryDisabled}
          onClick={onRetryJob}
        >
          <RefreshCw data-icon="inline-start" />
          重试
        </Button>
      ) : null}
    </div>
  )
}

function JobPreviewFooter({
  activeImageIndex,
  imageCount,
  lastJob,
  selectedConfig,
}: {
  activeImageIndex: number
  imageCount: number
  lastJob: ImageJob | null
  selectedConfig?: ImageModelConfig
}) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/30 px-3 text-sm">
      <span className="truncate text-muted-foreground">
        {lastJob ? formatShortTime(lastJob.createdAt) : "未创建"}
      </span>
      <div className="flex min-w-0 items-center justify-end gap-2">
        {imageCount > 1 ? (
          <span className="shrink-0 font-mono text-xs text-muted-foreground">
            {activeImageIndex + 1}/{imageCount}
          </span>
        ) : null}
        {lastJob ? (
          <span
            className={cn(
              "shrink-0 rounded-md border px-2 py-1 text-xs",
              statusToneClassNames[lastJob.status],
            )}
          >
            {statusLabels[lastJob.status]}
          </span>
        ) : null}
        <span className="min-w-0 truncate text-right text-foreground">
          {lastJob?.configName ?? selectedConfig?.name ?? "未选择模型"}
        </span>
      </div>
    </div>
  )
}

function ImagePreviewDialog({
  imageUrl,
  onOpenChange,
  open,
}: {
  imageUrl?: string
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  return (
    <Dialog open={open && Boolean(imageUrl)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-24px)] w-[98vw] max-w-none overflow-hidden p-2">
        {imageUrl ? (
          <div className="flex max-h-[calc(100dvh-48px)] min-h-[420px] items-center justify-center overflow-hidden rounded-lg border border-border/75 bg-black/40">
            <img
              src={imageUrl}
              alt="放大后的生成结果"
              className="max-h-[calc(100dvh-48px)] w-full object-contain"
            />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function ReferenceImagesField({
  referenceImages,
  onReferenceImagesChange,
}: {
  referenceImages: ReferenceImage[]
  onReferenceImagesChange: (value: ReferenceImage[]) => void
}) {
  const remaining = maxReferenceImages - referenceImages.length

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ""

    if (files.length === 0) {
      return
    }

    const imageFiles = files.filter((file) => file.type.startsWith("image/"))

    if (imageFiles.length !== files.length) {
      toast.warning("只支持上传图片文件")
    }
    if (remaining <= 0) {
      toast.warning("最多上传 6 张参考图")
      return
    }
    if (imageFiles.length > remaining) {
      toast.warning("最多上传 6 张参考图")
    }

    try {
      const nextImages = await Promise.all(
        imageFiles.slice(0, remaining).map(readReferenceImage),
      )

      onReferenceImagesChange([...referenceImages, ...nextImages])
    } catch {
      toast.error("参考图读取失败")
    }
  }

  function removeReferenceImage(id: string) {
    onReferenceImagesChange(referenceImages.filter((image) => image.id !== id))
  }

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <FieldLabel id="reference-images">参考图</FieldLabel>
        <span className="text-xs text-muted-foreground">
          {referenceImages.length}/{maxReferenceImages}
        </span>
      </div>
      <div className="grid gap-2">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {referenceImages.map((image) => (
            <div
              key={image.id}
              className="motion-hover-lift group/reference relative aspect-square overflow-hidden rounded-lg border border-border/70 bg-background/45"
            >
              <img
                src={image.dataUrl}
                alt={image.name}
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-md bg-black/65 text-white opacity-0 transition-opacity group-hover/reference:opacity-100 focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50"
                onClick={() => removeReferenceImage(image.id)}
                aria-label="移除参考图"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
          {referenceImages.length < maxReferenceImages ? (
            <label
              htmlFor="reference-images"
              className="motion-hover-lift flex aspect-square cursor-pointer items-center justify-center rounded-lg border border-dashed border-border/70 bg-background/35 text-muted-foreground hover:border-emerald-300/40 hover:bg-emerald-300/10 hover:text-emerald-100 focus-within:ring-3 focus-within:ring-ring/50"
            >
              <Upload className="size-5" />
              <span className="sr-only">上传参考图</span>
            </label>
          ) : null}
        </div>
      </div>
      <input
        id="reference-images"
        className="sr-only"
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileChange}
      />
    </div>
  )
}

function CompactSelectField({
  children,
  description,
  id,
  label,
}: {
  children: ReactNode
  description: string
  id: string
  label: string
}) {
  return (
    <div className="grid min-w-0 gap-2">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <FieldLabel id={id}>{label}</FieldLabel>
        <span className="hidden min-w-0 truncate text-xs text-muted-foreground sm:block">
          {description}
        </span>
      </div>
      {children}
    </div>
  )
}

function FieldLabel({
  children,
  id,
}: {
  children: ReactNode
  id: string
}) {
  return (
    <Label htmlFor={id} className="text-sm text-foreground">
      {children}
    </Label>
  )
}

function getPreviewFrameClass(aspectRatio: AspectRatio) {
  switch (aspectRatio) {
    case "auto":
      return "aspect-square max-w-[640px]"
    case "4:3":
      return "aspect-[4/3] max-w-[760px]"
    case "3:4":
      return "aspect-[3/4] max-w-[480px]"
    case "16:9":
      return "aspect-video max-w-[860px]"
    case "9:16":
      return "aspect-[9/16] max-w-[360px]"
    case "1:1":
      return "aspect-square max-w-[640px]"
  }
}

function readReferenceImage(file: File) {
  return new Promise<ReferenceImage>((resolve, reject) => {
    const reader = new FileReader()

    reader.addEventListener("load", () => {
      resolve({
        id: crypto.randomUUID(),
        name: file.name,
        dataUrl: String(reader.result),
      })
    })
    reader.addEventListener("error", reject)
    reader.readAsDataURL(file)
  })
}
