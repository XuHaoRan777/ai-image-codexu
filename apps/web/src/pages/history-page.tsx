import type { ImageJob, ImageJobStatus } from "@ai-image-codexu/shared"
import { History, ImagePlus } from "lucide-react"

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
                      {job.imageUrl ? (
                        <img
                          src={job.imageUrl}
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

              <div className="motion-pop flex max-h-[52dvh] min-h-[280px] items-center justify-center overflow-hidden rounded-lg border border-border/75 bg-black/30">
                {selectedHistoryJob.imageUrl ? (
                  <img
                    src={selectedHistoryJob.imageUrl}
                    alt="历史生图结果"
                    loading="lazy"
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <div className="grid justify-items-center gap-2 text-muted-foreground">
                    <ImagePlus className="size-8" />
                    <span className="text-sm">暂无图片</span>
                  </div>
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
