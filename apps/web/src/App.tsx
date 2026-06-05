import { useEffect, useMemo, useState } from "react"
import {
  type AspectRatio,
  type AssistantModelConfig,
  type CreateImageModelConfigInput,
  type ImageJob,
  type ImageModelConfig,
  type ImageQuantity,
  type ImageResolution,
  type UpdateImageModelConfigInput,
} from "@ai-image-codexu/shared"
import {
  Bot,
  Brush,
  History,
  ImagePlus,
  Layers3,
  Settings,
  type LucideIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { GlobalToast } from "@/components/global-toast"
import { Separator } from "@/components/ui/separator"
import { api } from "@/lib/api"
import {
  type AssistantFormState,
  type ReferenceImage,
} from "@/lib/image-ui"
import { toast } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { GeneratePage } from "@/pages/generate-page"
import { HistoryPage } from "@/pages/history-page"
import { SettingsPage } from "@/pages/settings-page"

type View = "generate" | "history" | "settings"

const viewHashes: Record<View, string> = {
  generate: "#/generate",
  history: "#/history",
  settings: "#/settings",
}

function readViewFromHash(): View {
  if (typeof window === "undefined") {
    return "generate"
  }

  const route = window.location.hash.replace(/^#\/?/, "").split(/[/?]/)[0]

  if (route === "history" || route === "settings" || route === "generate") {
    return route
  }

  return "generate"
}

const initialImageConfigForm: CreateImageModelConfigInput = {
  name: "",
  providerType: "onetopai",
  apiKey: "",
  modelNameOverride: "",
  enabled: true,
}

const initialAssistantForm: AssistantFormState = {
  mode: "openai",
  baseUrl: "",
  apiKey: "",
  modelName: "",
  enabled: false,
}

function App() {
  const [view, setView] = useState<View>(() => readViewFromHash())
  const [imageConfigs, setImageConfigs] = useState<ImageModelConfig[]>([])
  const [assistantConfig, setAssistantConfig] =
    useState<AssistantModelConfig | null>(null)
  const [imageConfigForm, setImageConfigForm] = useState(initialImageConfigForm)
  const [assistantForm, setAssistantForm] = useState(initialAssistantForm)
  const [configFormVisible, setConfigFormVisible] = useState(false)
  const [editingConfigId, setEditingConfigId] = useState<string | null>(null)
  const [selectedConfigId, setSelectedConfigId] = useState("")
  const [prompt, setPrompt] = useState("")
  const [optimizedPrompt, setOptimizedPrompt] = useState("")
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([])
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("auto")
  const [resolution, setResolution] = useState<ImageResolution>("1k")
  const [quantity, setQuantity] = useState<ImageQuantity>(1)
  const [lastJob, setLastJob] = useState<ImageJob | null>(null)
  const [historyJobs, setHistoryJobs] = useState<ImageJob[]>([])
  const [selectedHistoryJobId, setSelectedHistoryJobId] = useState("")
  const [loading, setLoading] = useState(false)
  const [creatingJob, setCreatingJob] = useState(false)
  const [updatingConfigEnabledId, setUpdatingConfigEnabledId] = useState("")

  const enabledConfigs = useMemo(
    () => imageConfigs.filter((config) => config.enabled),
    [imageConfigs],
  )

  const selectedConfig = useMemo(
    () =>
      imageConfigs.find((config) => config.id === selectedConfigId) ??
      enabledConfigs[0],
    [enabledConfigs, imageConfigs, selectedConfigId],
  )

  const selectedHistoryJob = useMemo(
    () => historyJobs.find((job) => job.id === selectedHistoryJobId) ?? null,
    [historyJobs, selectedHistoryJobId],
  )

  async function refreshConfigs() {
    const [configs, assistant] = await Promise.all([
      api.listImageModelConfigs(),
      api.getAssistantConfig(),
    ])

    setImageConfigs(configs)
    setAssistantConfig(assistant)
    setAssistantForm({
      mode: assistant.mode,
      baseUrl: assistant.baseUrl,
      apiKey: "",
      modelName: assistant.modelName,
      enabled: assistant.enabled,
    })

    if (!selectedConfigId && configs.length > 0) {
      setSelectedConfigId(configs.find((item) => item.enabled)?.id ?? "")
    }
  }

  function rememberJob(job: ImageJob) {
    setHistoryJobs((current) => [
      job,
      ...current.filter((item) => item.id !== job.id),
    ])
  }

  function resetImageConfigForm() {
    setImageConfigForm(initialImageConfigForm)
    setEditingConfigId(null)
  }

  function startCreateConfig() {
    resetImageConfigForm()
    setEditingConfigId(null)
    setConfigFormVisible(true)
  }

  function startEditConfig(config: ImageModelConfig) {
    setImageConfigForm({
      name: config.name,
      providerType: config.providerType,
      apiKey: "",
      modelNameOverride: config.modelNameOverride ?? "",
      enabled: config.enabled,
    })
    setEditingConfigId(config.id)
    setConfigFormVisible(true)
  }

  function cancelConfigForm() {
    resetImageConfigForm()
    setConfigFormVisible(false)
  }

  function navigateToView(nextView: View) {
    setView(nextView)

    if (window.location.hash !== viewHashes[nextView]) {
      window.location.hash = viewHashes[nextView]
    }
  }

  useEffect(() => {
    function handleHashChange() {
      setView(readViewFromHash())
    }

    window.addEventListener("hashchange", handleHashChange)

    return () => {
      window.removeEventListener("hashchange", handleHashChange)
    }
  }, [])

  useEffect(() => {
    let ignore = false

    async function loadInitialConfigs() {
      try {
        const [configs, assistant] = await Promise.all([
          api.listImageModelConfigs(),
          api.getAssistantConfig(),
        ])

        if (ignore) {
          return
        }

        setImageConfigs(configs)
        setAssistantConfig(assistant)
        setAssistantForm({
          mode: assistant.mode,
          baseUrl: assistant.baseUrl,
          apiKey: "",
          modelName: assistant.modelName,
          enabled: assistant.enabled,
        })
        setSelectedConfigId(
          configs.find((item) => item.enabled)?.id ?? "",
        )
      } catch (error) {
        if (!ignore) {
          toast.error(error instanceof Error ? error.message : "加载配置失败")
        }
      }
    }

    void loadInitialConfigs()

    return () => {
      ignore = true
    }
  }, [])

  async function handleSaveImageConfig() {
    setLoading(true)

    try {
      if (editingConfigId) {
        const input: UpdateImageModelConfigInput = {
          ...imageConfigForm,
        }
        const updated = await api.updateImageModelConfig(editingConfigId, input)

        setImageConfigs((current) =>
          current.map((item) => (item.id === updated.id ? updated : item)),
        )
        toast.success("生图模型配置已更新")
      } else {
        const created = await api.createImageModelConfig(imageConfigForm)
        setImageConfigs((current) => [created, ...current])
        if (created.enabled) {
          setSelectedConfigId(created.id)
        }
        toast.success("生图模型配置已新增")
      }

      resetImageConfigForm()
      setConfigFormVisible(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存配置失败")
    } finally {
      setLoading(false)
    }
  }

  async function handleDeleteConfig(id: string) {
    setLoading(true)

    try {
      await api.deleteImageModelConfig(id)
      setImageConfigs((current) => current.filter((item) => item.id !== id))
      if (selectedConfigId === id) {
        setSelectedConfigId("")
      }
      if (editingConfigId === id) {
        cancelConfigForm()
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除配置失败")
    } finally {
      setLoading(false)
    }
  }

  async function handleToggleConfigEnabled(id: string, enabled: boolean) {
    setUpdatingConfigEnabledId(id)

    try {
      const updated = await api.updateImageModelConfigEnabled(id, { enabled })

      setImageConfigs((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      )
      setSelectedConfigId((currentSelectedId) => {
        if (updated.enabled) {
          return currentSelectedId || updated.id
        }

        if (currentSelectedId !== updated.id) {
          return currentSelectedId
        }

        const nextConfigs = imageConfigs.map((item) =>
          item.id === updated.id ? updated : item,
        )
        const nextEnabledConfigs = nextConfigs.filter((item) => item.enabled)

        return nextEnabledConfigs[0]?.id ?? ""
      })
      toast.success(enabled ? "模型配置已启用" : "模型配置已停用")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新启用状态失败")
    } finally {
      setUpdatingConfigEnabledId("")
    }
  }

  async function handleSaveAssistant() {
    setLoading(true)

    try {
      const updated = await api.updateAssistantConfig(assistantForm)
      setAssistantConfig(updated)
      setAssistantForm((current) => ({ ...current, apiKey: "" }))
      toast.success("辅助模型配置已保存")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存辅助模型失败")
    } finally {
      setLoading(false)
    }
  }

  async function handleOptimizePrompt() {
    if (!prompt.trim()) {
      toast.warning("请先输入提示词")
      return
    }

    setLoading(true)

    try {
      const result = await api.optimizePrompt(prompt)
      setOptimizedPrompt(result.optimizedPrompt)
      toast.success("提示词已优化")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "优化提示词失败")
    } finally {
      setLoading(false)
    }
  }

  async function handleCreateJob() {
    const finalPrompt = optimizedPrompt || prompt

    if (!selectedConfigId || !finalPrompt.trim()) {
      toast.warning("请选择模型配置并输入提示词")
      return
    }

    setLoading(true)
    setCreatingJob(true)

    try {
      const job = await api.createImageJob({
        configId: selectedConfigId,
        prompt: finalPrompt,
        aspectRatio,
        resolution,
        quantity,
        referenceImages: referenceImages.map((image) => image.dataUrl),
      })

      setLastJob(job)
      rememberJob(job)
      toast.success("生图任务已创建")
      pollImageJob(job.id)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建生图任务失败")
    } finally {
      setCreatingJob(false)
      setLoading(false)
    }
  }

  function pollImageJob(id: string, attempt = 0) {
    const maxAttempts = 80

    window.setTimeout(() => {
      void api
        .getImageJob(id)
        .then((updated) => {
          setLastJob(updated)
          rememberJob(updated)

          if (
            updated.status === "queued" ||
            updated.status === "running"
          ) {
            if (attempt < maxAttempts) {
              pollImageJob(id, attempt + 1)
            }
          }
        })
        .catch(() => undefined)
    }, 1500)
  }

  const assistantEnabled = Boolean(assistantConfig?.enabled)

  return (
    <>
      <GlobalToast />
      <main className="min-h-dvh overflow-x-hidden bg-background text-foreground lg:h-dvh lg:overflow-hidden">
      <div className="app-shell grid min-h-dvh grid-cols-1 lg:h-dvh lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="motion-panel z-10 border-b border-sidebar-border/70 bg-sidebar/88 px-4 py-4 backdrop-blur-xl lg:h-dvh lg:border-r lg:border-b-0 lg:px-5 lg:py-6">
          <div className="motion-pop flex items-center gap-3">
            <div className="brand-mark">
              <Brush className="size-5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate font-mono text-base font-semibold leading-tight">
                AI Image Codexu
              </h1>
            </div>
          </div>

          <nav className="motion-stagger mt-6 grid gap-2" aria-label="主导航">
            <NavButton
              active={view === "generate"}
              href={viewHashes.generate}
              icon={ImagePlus}
              label="生图"
              tone="green"
              onClick={() => {
                navigateToView("generate")
                void refreshConfigs().catch((error: Error) =>
                  toast.error(error.message),
                )
              }}
            />
            <NavButton
              active={view === "history"}
              href={viewHashes.history}
              icon={History}
              label="历史"
              tone="cyan"
              onClick={() => navigateToView("history")}
            />
            <NavButton
              active={view === "settings"}
              href={viewHashes.settings}
              icon={Settings}
              label="配置"
              tone="amber"
              onClick={() => navigateToView("settings")}
            />
          </nav>

          <Separator className="my-6 bg-sidebar-border/70" />

          <div className="motion-stagger grid gap-3 text-sm">
            <SideMetric
              icon={Layers3}
              label="模型配置"
              value={`${enabledConfigs.length}/${imageConfigs.length}`}
              caption="启用 / 全部"
            />
            <SideMetric
              icon={Bot}
              label="提示词辅助"
              value={assistantEnabled ? "在线" : "关闭"}
              caption={assistantEnabled ? assistantForm.mode : "直传原提示词"}
              tone={assistantEnabled ? "success" : "muted"}
            />
          </div>
        </aside>

        <section className="z-10 min-w-0 p-3 sm:p-4 lg:h-dvh lg:overflow-hidden">
          <div
            key={view}
            className="motion-page flex w-full max-w-none flex-col gap-3 lg:h-full lg:min-h-0"
          >
            {view === "generate" ? (
              <GeneratePage
                aspectRatio={aspectRatio}
                creatingJob={creatingJob}
                enabledConfigs={enabledConfigs}
                lastJob={lastJob}
                loading={loading}
                optimizedPrompt={optimizedPrompt}
                prompt={prompt}
                quantity={quantity}
                referenceImages={referenceImages}
                resolution={resolution}
                selectedConfig={selectedConfig}
                selectedConfigId={selectedConfigId}
                onAspectRatioChange={setAspectRatio}
                onCreateJob={handleCreateJob}
                onOptimizePrompt={handleOptimizePrompt}
                onPromptChange={(value) => {
                  setPrompt(value)
                  setOptimizedPrompt("")
                }}
                onQuantityChange={setQuantity}
                onReferenceImagesChange={setReferenceImages}
                onResolutionChange={setResolution}
                onSelectedConfigChange={setSelectedConfigId}
                onUseOptimizedPrompt={() => {
                  setPrompt(optimizedPrompt)
                  setOptimizedPrompt("")
                }}
              />
            ) : view === "history" ? (
              <HistoryPage
                historyJobs={historyJobs}
                selectedHistoryJob={selectedHistoryJob}
                selectedHistoryJobId={selectedHistoryJobId}
                onSelectHistoryJob={setSelectedHistoryJobId}
              />
            ) : (
              <SettingsPage
                assistantForm={assistantForm}
                configFormVisible={configFormVisible}
                editingConfigId={editingConfigId}
                imageConfigForm={imageConfigForm}
                imageConfigs={imageConfigs}
                loading={loading}
                updatingConfigEnabledId={updatingConfigEnabledId}
                onAssistantFormChange={setAssistantForm}
                onCancelConfigForm={cancelConfigForm}
                onDeleteConfig={handleDeleteConfig}
                onEditConfig={startEditConfig}
                onImageConfigFormChange={setImageConfigForm}
                onSaveAssistant={handleSaveAssistant}
                onSaveImageConfig={handleSaveImageConfig}
                onStartCreateConfig={startCreateConfig}
                onToggleConfigEnabled={handleToggleConfigEnabled}
              />
            )}
          </div>
        </section>
      </div>
    </main>
    </>
  )
}

function NavButton({
  active,
  href,
  icon: Icon,
  label,
  onClick,
  tone,
}: {
  active: boolean
  href: string
  icon: LucideIcon
  label: string
  onClick: () => void
  tone: "green" | "cyan" | "amber"
}) {
  return (
    <Button
      asChild
      variant={active ? "secondary" : "ghost"}
      className={cn(
        "h-11 justify-start rounded-lg px-3 text-sm",
        "motion-hover-lift",
        active &&
          tone === "green" &&
          "border border-emerald-300/20 bg-emerald-300/10 text-emerald-50 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.08)]",
        active &&
          tone === "cyan" &&
          "border border-cyan-300/20 bg-cyan-300/10 text-cyan-50 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.08)]",
        active &&
          tone === "amber" &&
          "border border-amber-300/20 bg-amber-300/10 text-amber-50 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.08)]",
      )}
    >
      <a
        aria-current={active ? "page" : undefined}
        href={href}
        onClick={(event) => {
          event.preventDefault()
          onClick()
        }}
      >
        <Icon data-icon="inline-start" />
        {label}
      </a>
    </Button>
  )
}

function SideMetric({
  caption,
  icon: Icon,
  label,
  tone = "muted",
  value,
}: {
  caption: string
  icon: LucideIcon
  label: string
  tone?: "success" | "muted"
  value: string
}) {
  return (
    <div className="motion-hover-lift rounded-lg border border-sidebar-border/70 bg-background/35 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Icon
            className={cn(
              "size-4 shrink-0",
              tone === "success" ? "text-emerald-200" : "text-muted-foreground",
            )}
          />
          <span className="truncate text-muted-foreground">{label}</span>
        </div>
        <span className="font-mono text-sm text-foreground">{value}</span>
      </div>
      <p className="mt-2 truncate text-xs text-muted-foreground">{caption}</p>
    </div>
  )
}

export default App
