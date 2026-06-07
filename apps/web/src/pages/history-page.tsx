import { useState } from "react"
import type { ImageJob, ImageJobStatus } from "@ai-image-codexu/shared"
import { Expand, History, ImagePlus } from "lucide-react"

import { EmptyPanel } from "@/components/empty-panel"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  aspectRatioLabels,
  formatShortTime,
  getImageJobUrls,
  providerTypeLabels,
  resolutionLabels,
  statusLabels,
  statusToneClassNames,
} from "@/lib/image-ui"
import { cn } from "@/lib/utils"

export function HistoryPage({
  historyJobs,
  onSelectHistoryJob,
  selectedHistoryJob,
  selectedHistoryJobId,
}: {
  historyJobs: ImageJob[]
  onSelectHistoryJob: (id: string) => void
  selectedHistoryJob: ImageJob | null
  selectedHistoryJobId: string
}) {
  const selectedImageUrls = getImageJobUrls(selectedHistoryJob)
  const [selectedImage, setSelectedImage] = useState({
    jobId: "",
    index: 0,
  })
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false)
  const activeImageIndex =
    selectedImage.jobId === selectedHistoryJob?.id &&
    selectedImage.index < selectedImageUrls.length
      ? selectedImage.index
      : 0
  const activeImageUrl =
    selectedImageUrls[activeImageIndex] ?? selectedImageUrls[0]

  return (
    <>
      <Card className="motion-panel surface-panel rounded-lg lg:min-h-0 lg:flex-1">
        <CardHeader className="border-b border-border/70 pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <History className="size-5 text-cyan-200" />
            历史列表
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-1 lg:min-h-0 lg:overflow-auto">
          {historyJobs.length > 0 ? (
            <div className="motion-stagger grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {historyJobs.map((job) => (
                <button
                  key={job.id}
                  type="button"
                  className={cn(
                    "motion-hover-lift group/history rounded-lg border border-border/70 bg-background/45 p-2 text-left hover:border-emerald-300/35 hover:bg-emerald-300/10 focus-visible:ring-3 focus-visible:ring-ring/50",
                    selectedHistoryJobId === job.id &&
                      "border-emerald-300/45 bg-emerald-300/15",
                  )}
                  onClick={() => onSelectHistoryJob(job.id)}
                >
                  <div className="flex gap-3">
                    <div className="flex aspect-square size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/70 bg-muted/40">
                      {getImageJobUrls(job)[0] ? (
                        <img
                          src={getImageJobUrls(job)[0]}
                          alt="历史生图缩略图"
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <ImagePlus className="size-6 text-muted-foreground transition-colors group-hover/history:text-emerald-100" />
                      )}
                    </div>
                    <div className="min-w-0 py-1">
                      <p className="truncate text-sm font-medium">
                        {job.configName}
                      </p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {providerTypeLabels[job.providerType]}
                      </p>
                      <div className="mt-3">
                        <StatusBadge status={job.status} />
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <EmptyPanel icon={History} title="暂无历史" />
          )}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(selectedHistoryJob)}
        onOpenChange={(open) => {
          if (!open) {
            onSelectHistoryJob("")
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          {selectedHistoryJob ? (
            <>
              <DialogHeader>
                <DialogTitle>历史详情</DialogTitle>
                <DialogDescription>
                  {formatShortTime(selectedHistoryJob.createdAt)} ·{" "}
                  {selectedHistoryJob.configName}
                </DialogDescription>
              </DialogHeader>

              <div className="motion-pop grid gap-2">
                <div className="flex max-h-[52dvh] min-h-[280px] items-center justify-center overflow-hidden rounded-lg border border-border/75 bg-black/30">
                  {activeImageUrl ? (
                    <button
                      type="button"
                      className="group/history-preview relative h-full w-full focus-visible:ring-3 focus-visible:ring-ring/50"
                      onClick={() => setPreviewDialogOpen(true)}
                      aria-label="放大查看历史图片"
                    >
                      <img
                        src={activeImageUrl}
                        alt="历史生图结果"
                        loading="lazy"
                        className="h-full w-full object-contain"
                      />
                      <span className="absolute right-3 top-3 flex size-9 items-center justify-center rounded-lg border border-white/20 bg-black/55 text-white opacity-0 shadow-lg backdrop-blur transition-opacity group-hover/history-preview:opacity-100 group-focus-visible/history-preview:opacity-100">
                        <Expand className="size-4" />
                      </span>
                    </button>
                  ) : (
                    <div className="grid justify-items-center gap-2 text-muted-foreground">
                      <ImagePlus className="size-8" />
                      <span className="text-sm">暂无图片</span>
                    </div>
                  )}
                </div>
                {selectedImageUrls.length > 1 ? (
                  <div className="flex min-h-16 gap-2 overflow-x-auto rounded-lg border border-border/70 bg-background/35 p-2">
                    {selectedImageUrls.map((url, index) => (
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
                          setSelectedImage({
                            jobId: selectedHistoryJob.id,
                            index,
                          })
                        }
                        aria-label={`查看第 ${index + 1} 张历史结果`}
                      >
                        <img
                          src={url}
                          alt={`历史生图结果 ${index + 1}`}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                ) : (
                  null
                )}
              </div>
              <div className="motion-pop grid gap-3 rounded-lg border border-border/70 bg-muted/30 p-3 text-sm">
                <div className="grid gap-1">
                  <span className="text-xs text-muted-foreground">提示词</span>
                  <p className="max-h-36 overflow-auto whitespace-pre-wrap leading-6">
                    {selectedHistoryJob.prompt}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <HistoryMeta
                    label="模型配置"
                    value={selectedHistoryJob.configName}
                  />
                  <HistoryMeta
                    label="来源"
                    value={providerTypeLabels[selectedHistoryJob.providerType]}
                  />
                  <HistoryMeta
                    label="模型"
                    value={selectedHistoryJob.modelName}
                  />
                  <HistoryMeta
                    label="尺寸"
                    value={aspectRatioLabels[selectedHistoryJob.aspectRatio]}
                  />
                  <HistoryMeta
                    label="分辨率"
                    value={resolutionLabels[selectedHistoryJob.resolution]}
                  />
                  <HistoryMeta
                    label="数量"
                    value={String(selectedHistoryJob.quantity)}
                  />
                  {selectedImageUrls.length > 1 ? (
                    <HistoryMeta
                      label="当前图片"
                      value={`${activeImageIndex + 1}/${selectedImageUrls.length}`}
                    />
                  ) : null}
                  <HistoryMeta
                    label="创建时间"
                    value={formatShortTime(selectedHistoryJob.createdAt)}
                  />
                  <HistoryMeta
                    label="状态"
                    value={statusLabels[selectedHistoryJob.status]}
                  />
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={previewDialogOpen && Boolean(activeImageUrl)}
        onOpenChange={setPreviewDialogOpen}
      >
        <DialogContent className="max-h-[calc(100dvh-24px)] w-[98vw] max-w-none overflow-hidden p-2">
          {activeImageUrl ? (
            <div className="flex max-h-[calc(100dvh-48px)] min-h-[420px] items-center justify-center overflow-hidden rounded-lg border border-border/75 bg-black/40">
              <img
                src={activeImageUrl}
                alt="放大后的历史图片"
                className="max-h-[calc(100dvh-48px)] w-full object-contain"
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}

function StatusBadge({ status }: { status: ImageJobStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn("border px-2", statusToneClassNames[status])}
    >
      {statusLabels[status]}
    </Badge>
  )
}

function HistoryMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-border/60 bg-background/45 p-2">
      <p className="truncate text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-foreground">{value}</p>
    </div>
  )
}
