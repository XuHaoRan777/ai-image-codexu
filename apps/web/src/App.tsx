import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  type AspectRatio,
  type AiImageModelConfigRequest,
  type AssistantModelConfig,
  type CreateImageModelConfigInput,
  type ImageJob,
  type ImageModelConfig,
  ImageProviderTypeEnum,
  type ImageQuantity,
  type ImageResolution,
  type UpdateImageModelConfigInput,
} from "@ai-image-codexu/shared"
import {
  Bot,
  Brush,
  Eye,
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
  applyHttpPresetToDraft,
  buildHttpConfigFromDraft,
  createHttpConfigDraft,
} from "@/lib/http-config-draft"
import {
  defaultImageProviderHttpPreset,
  type ImageProviderHttpSection,
  type ImageProviderHttpPreset,
} from "@/lib/image-provider-presets"
import {
  type AssistantFormState,
  isImageJobActive,
  type ReferenceImage,
} from "@/lib/image-ui"
import { toast } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { GeneratePage } from "@/pages/generate-page"
import { HistoryPage } from "@/pages/history-page"
import { ImageRecognitionPage } from "@/pages/image-recognition-page"
import { SettingsPage } from "@/pages/settings-page"

type View = "generate" | "history" | "recognize" | "settings"

const viewHashes: Record<View, string> = {
  generate: "#/generate",
  history: "#/history",
  recognize: "#/recognize",
  settings: "#/settings",
}
const imageJobPollIntervalMs = 1500
const imageJobPollTimeoutMs = 300_000

function readViewFromHash(): View {
  if (typeof window === "undefined") {
    return "generate"
  }

  const route = window.location.hash.replace(/^#\/?/, "").split(/[/?]/)[0]

  if (
    route === "history" ||
    route === "recognize" ||
    route === "settings" ||
    route === "generate"
  ) {
    return route
  }

  return "generate"
}

const initialImageConfigForm: CreateImageModelConfigInput = {
  name: "",
  providerType: ImageProviderTypeEnum.ConfigurableHttp,
  deliveryMode: defaultImageProviderHttpPreset.deliveryMode,
  baseUrl: "",
  generationPath: "",
  editPath: "",
  apiKey: "",
  modelName: defaultImageProviderHttpPreset.modelName,
  fieldMapping: {},
  fieldOverrides: {
    model: true,
    prompt: true,
    size: true,
    quantity: true,
    quality: true,
    resolution: false,
    responseFormat: true,
    image: true,
  },
  pollingConfig: {
    taskIdPath: "id",
    pollPathTemplate: "/v1/tasks/{taskId}",
    statusPath: "status",
    successStatusValue: "completed",
    failureStatusValue: "failed",
    resultUrlsPath: "result_data[].url",
    intervalMs: 5000,
    timeoutMs: 300000,
  },
  httpConfig: defaultImageProviderHttpPreset.config,
  enabled: true,
}

const initialAssistantForm: AssistantFormState = {
  mode: "openai",
  url: "",
  apiKey: "",
  modelName: "",
  enabled: false,
}

const initialAiImageConfigForm: AiImageModelConfigRequest = {
  configName: "",
  modelName: "",
  sourceUrl: "",
  sourceText: "",
}

function App() {
  const [view, setView] = useState<View>(() => readViewFromHash())
  const [imageConfigs, setImageConfigs] = useState<ImageModelConfig[]>([])
  const [assistantConfig, setAssistantConfig] =
    useState<AssistantModelConfig | null>(null)
  const [imageConfigForm, setImageConfigForm] = useState(initialImageConfigForm)
  const [httpConfigDraft, setHttpConfigDraft] = useState(() =>
    createHttpConfigDraft(defaultImageProviderHttpPreset.config),
  )
  const [aiImageConfigForm, setAiImageConfigForm] = useState(
    initialAiImageConfigForm,
  )
  const [assistantForm, setAssistantForm] = useState(initialAssistantForm)
  const [configFormVisible, setConfigFormVisible] = useState(false)
  const [editingConfigId, setEditingConfigId] = useState<string | null>(null)
  const [selectedConfigId, setSelectedConfigId] = useState("")
  const [prompt, setPrompt] = useState("")
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([])
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("auto")
  const [resolution, setResolution] = useState<ImageResolution>("1k")
  const [quantity, setQuantity] = useState<ImageQuantity>(1)
  const [lastJob, setLastJob] = useState<ImageJob | null>(null)
  const [historyJobs, setHistoryJobs] = useState<ImageJob[]>([])
  const [selectedHistoryJobId, setSelectedHistoryJobId] = useState("")
  const [loading, setLoading] = useState(false)
  const [optimizingPrompt, setOptimizingPrompt] = useState(false)
  const [creatingJob, setCreatingJob] = useState(false)
  const [creatingAiConfig, setCreatingAiConfig] = useState(false)
  const [pollingJobId, setPollingJobId] = useState("")
  const [deletingHistoryJobId, setDeletingHistoryJobId] = useState("")
  const [updatingAssistantEnabled, setUpdatingAssistantEnabled] =
    useState(false)
  const [updatingConfigEnabledId, setUpdatingConfigEnabledId] = useState("")
  const generationLockedRef = useRef(false)
  const userDeletedJobIdsRef = useRef(new Set<string>())

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
  const activeJob =
    (lastJob && isImageJobActive(lastJob) ? lastJob : null) ??
    historyJobs.find(isImageJobActive) ??
    null
  const isGenerating = creatingJob || Boolean(activeJob)
  const httpConfigBuild = useMemo(
    () =>
      buildHttpConfigFromDraft(httpConfigDraft, imageConfigForm.deliveryMode),
    [httpConfigDraft, imageConfigForm.deliveryMode],
  )
  const httpConfigError = httpConfigBuild.errors[0] ?? ""

  useEffect(() => {
    generationLockedRef.current = isGenerating
  }, [isGenerating])

  async function refreshConfigs() {
    const [configs, assistant] = await Promise.all([
      api.listImageModelConfigs(),
      api.getAssistantConfig(),
    ])

    setImageConfigs(configs)
    setAssistantConfig(assistant)
    setAssistantForm({
      mode: assistant.mode,
      url: assistant.url,
      apiKey: "",
      modelName: assistant.modelName,
      enabled: assistant.enabled,
    })

    if (!selectedConfigId && configs.length > 0) {
      setSelectedConfigId(configs.find((item) => item.enabled)?.id ?? "")
    }
  }

  async function refreshHistoryJobs() {
    const jobs = await api.listImageJobs()
    setHistoryJobs(jobs)
    setLastJob((currentJob) => {
      if (!currentJob) {
        return currentJob
      }

      return jobs.find((job) => job.id === currentJob.id) ?? currentJob
    })
    setSelectedHistoryJobId((currentId) =>
      jobs.some((job) => job.id === currentId) ? currentId : "",
    )
  }

  const rememberJob = useCallback((job: ImageJob) => {
    setHistoryJobs((current) => [
      job,
      ...current.filter((item) => item.id !== job.id),
    ])
  }, [])

  const pollImageJob = useCallback(
    (id: string) => {
      const maxAttempts = Math.ceil(
        imageJobPollTimeoutMs / imageJobPollIntervalMs,
      )
      let attempt = 0

      function scheduleNextPoll() {
        setPollingJobId(id)
        window.setTimeout(pollOnce, imageJobPollIntervalMs)
      }

      function pollOnce() {
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
                attempt += 1
                scheduleNextPoll()
              } else {
                setPollingJobId((currentId) =>
                  currentId === id ? "" : currentId,
                )
                toast.warning("生图任务仍在进行，可稍后从历史记录查看")
              }
            } else {
              generationLockedRef.current = false
              setPollingJobId((currentId) =>
                currentId === id ? "" : currentId,
              )
            }
          })
          .catch((error: Error) => {
            if (error.message.includes("生图任务不存在")) {
              const wasDeletedByUser = userDeletedJobIdsRef.current.has(id)

              setLastJob((currentJob) =>
                currentJob?.id === id ? null : currentJob,
              )
              setHistoryJobs((current) =>
                current.filter((job) => job.id !== id),
              )
              setPollingJobId((currentId) =>
                currentId === id ? "" : currentId,
              )
              generationLockedRef.current = false
              if (!wasDeletedByUser) {
                toast.error("生图失败")
              }
              return
            }

            setPollingJobId((currentId) =>
              currentId === id ? "" : currentId,
            )
            toast.warning("暂时无法刷新生图任务状态")
          })
      }

      scheduleNextPoll()
    },
    [rememberJob],
  )

  async function deleteHistoryJob(id: string) {
    if (deletingHistoryJobId) {
      return
    }

    setDeletingHistoryJobId(id)
    userDeletedJobIdsRef.current.add(id)

    try {
      await api.deleteImageJob(id)
      setHistoryJobs((current) => current.filter((job) => job.id !== id))
      setSelectedHistoryJobId((currentId) =>
        currentId === id ? "" : currentId,
      )
      setLastJob((currentJob) => (currentJob?.id === id ? null : currentJob))
      setPollingJobId((currentId) => (currentId === id ? "" : currentId))
      toast.success("历史记录已删除")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除历史记录失败")
    } finally {
      setDeletingHistoryJobId("")
      window.setTimeout(() => {
        userDeletedJobIdsRef.current.delete(id)
      }, imageJobPollIntervalMs * 2)
    }
  }

  function resetImageConfigForm() {
    setImageConfigForm(initialImageConfigForm)
    setHttpConfigDraft(createHttpConfigDraft(defaultImageProviderHttpPreset.config))
    setAiImageConfigForm(initialAiImageConfigForm)
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
      deliveryMode: config.deliveryMode,
      baseUrl: config.baseUrl,
      generationPath: config.generationPath ?? "",
      editPath: config.editPath ?? "",
      apiKey: "",
      // Google 模式配置的 modelName 可能为空,兜底空串避免受控输入告警
      modelName: config.modelName ?? "",
      fieldMapping: config.fieldMapping ?? {},
      fieldOverrides: config.fieldOverrides ?? {},
      pollingConfig: config.pollingConfig ?? initialImageConfigForm.pollingConfig,
      httpConfig: config.httpConfig ?? initialImageConfigForm.httpConfig,
      enabled: config.enabled,
    })
    setHttpConfigDraft(
      createHttpConfigDraft(config.httpConfig ?? defaultImageProviderHttpPreset.config),
    )
    setEditingConfigId(config.id)
    setConfigFormVisible(true)
  }

  function handleApplyHttpSectionPreset(
    section: ImageProviderHttpSection,
    preset: ImageProviderHttpPreset,
  ) {
    setHttpConfigDraft((current) =>
      applyHttpPresetToDraft(current, section, preset.config),
    )
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
        const [configs, assistant, jobs] = await Promise.all([
          api.listImageModelConfigs(),
          api.getAssistantConfig(),
          api.listImageJobs(),
        ])

        if (ignore) {
          return
        }

        setImageConfigs(configs)
        setAssistantConfig(assistant)
        setAssistantForm({
          mode: assistant.mode,
          url: assistant.url,
          apiKey: "",
          modelName: assistant.modelName,
          enabled: assistant.enabled,
        })
        setSelectedConfigId(
          configs.find((item) => item.enabled)?.id ?? "",
        )
        setHistoryJobs(jobs)
        const runningJob = jobs.find(isImageJobActive)

        if (runningJob) {
          generationLockedRef.current = true
          setLastJob(runningJob)
          pollImageJob(runningJob.id)
        }
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
  }, [pollImageJob])

  async function handleSaveImageConfig() {
    if (!httpConfigBuild.config) {
      toast.warning(httpConfigError || "HTTP 模板配置不完整")
      return
    }

    setLoading(true)

    try {
      // HTTP 模板表单只保存草稿；真正提交给后端前才封装为 httpConfig JSON。
      const imageConfigInput = {
        ...imageConfigForm,
        providerType: ImageProviderTypeEnum.ConfigurableHttp,
        httpConfig: httpConfigBuild.config,
      }

      if (editingConfigId) {
        const input: UpdateImageModelConfigInput = {
          ...imageConfigInput,
        }
        const updated = await api.updateImageModelConfig(editingConfigId, input)

        setImageConfigs((current) =>
          current.map((item) => (item.id === updated.id ? updated : item)),
        )
        toast.success("生图模型配置已更新")
      } else {
        const created = await api.createImageModelConfig(imageConfigInput)
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

  async function handleCreateImageConfigWithAi() {
    const input: AiImageModelConfigRequest = {
      configName: aiImageConfigForm.configName?.trim() ?? "",
      modelName: aiImageConfigForm.modelName?.trim() ?? "",
      sourceUrl: aiImageConfigForm.sourceUrl?.trim() ?? "",
      sourceText: aiImageConfigForm.sourceText?.trim() ?? "",
    }

    if (!input.sourceUrl && !input.sourceText) {
      toast.warning("请填写文档地址或文档信息")
      return
    }

    setLoading(true)
    setCreatingAiConfig(true)

    try {
      const created = await api.createImageModelConfigWithAi(input)

      setImageConfigs((current) => [created, ...current])
      resetImageConfigForm()
      setConfigFormVisible(false)
      toast.success("AI 配置已生成，补充密钥后可启用")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "AI 配置生成失败")
    } finally {
      setCreatingAiConfig(false)
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
      setAssistantForm({
        mode: updated.mode,
        url: updated.url,
        apiKey: "",
        modelName: updated.modelName,
        enabled: updated.enabled,
      })
      toast.success("辅助模型配置已保存")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存辅助模型失败")
    } finally {
      setLoading(false)
    }
  }

  async function handleToggleAssistantEnabled(enabled: boolean) {
    const previousForm = assistantForm
    const previousConfig = assistantConfig
    const nextForm = {
      ...assistantForm,
      enabled,
    }

    setUpdatingAssistantEnabled(true)
    setAssistantForm(nextForm)
    setAssistantConfig((current) =>
      current ? { ...current, enabled } : current,
    )

    try {
      const updated = await api.updateAssistantConfig(nextForm)

      setAssistantConfig(updated)
      setAssistantForm({
        mode: updated.mode,
        url: updated.url,
        apiKey: "",
        modelName: updated.modelName,
        enabled: updated.enabled,
      })
      toast.success(enabled ? "辅助模型已启用" : "辅助模型已停用")
    } catch (error) {
      setAssistantForm(previousForm)
      setAssistantConfig(previousConfig)
      toast.error(error instanceof Error ? error.message : "更新辅助模型状态失败")
    } finally {
      setUpdatingAssistantEnabled(false)
    }
  }

  async function handleOptimizePrompt() {
    if (generationLockedRef.current) {
      toast.warning("当前生图任务完成后再优化提示词")
      return
    }
    if (!prompt.trim()) {
      toast.warning("请先输入提示词")
      return
    }

    setOptimizingPrompt(true)

    try {
      const result = await api.optimizePrompt(prompt)
      setPrompt(result.optimizedPrompt)
      toast.success("提示词已优化")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "优化提示词失败")
    } finally {
      setOptimizingPrompt(false)
    }
  }

  async function handleCreateJob() {
    if (generationLockedRef.current) {
      toast.warning("已有生图任务正在进行")
      return
    }
    if (optimizingPrompt) {
      toast.warning("提示词优化完成后再创建生图任务")
      return
    }
    if (!selectedConfigId || !prompt.trim()) {
      toast.warning("请选择模型配置并输入提示词")
      return
    }

    await createImageJobWithInput({
      configId: selectedConfigId,
      prompt,
      aspectRatio,
      resolution,
      quantity,
      referenceImages: referenceImages.map((image) => image.dataUrl),
    })
  }

  function handleRetryJob() {
    if (!lastJob) {
      return
    }

    if (generationLockedRef.current) {
      toast.warning("已有生图任务正在进行")
      return
    }
    if (optimizingPrompt) {
      toast.warning("提示词优化完成后再重试生图")
      return
    }

    setSelectedConfigId(lastJob.configId)
    setPrompt(lastJob.prompt)
    setAspectRatio(lastJob.aspectRatio)
    setResolution(lastJob.resolution)
    setQuantity(lastJob.quantity as ImageQuantity)
    void createImageJobWithInput({
      configId: lastJob.configId,
      prompt: lastJob.prompt,
      aspectRatio: lastJob.aspectRatio,
      resolution: lastJob.resolution,
      quantity: lastJob.quantity as ImageQuantity,
      referenceImages: referenceImages.map((image) => image.dataUrl),
    })
  }

  async function createImageJobWithInput(input: {
    configId: string
    prompt: string
    aspectRatio: AspectRatio
    resolution: ImageResolution
    quantity: ImageQuantity
    referenceImages: string[]
  }) {
    if (generationLockedRef.current) {
      toast.warning("已有生图任务正在进行")
      return
    }

    generationLockedRef.current = true
    setLoading(true)
    setCreatingJob(true)

    try {
      const job = await api.createImageJob(input)

      setLastJob(job)
      rememberJob(job)
      toast.success("生图任务已创建")
      pollImageJob(job.id)
    } catch (error) {
      generationLockedRef.current = false
      toast.error(error instanceof Error ? error.message : "创建生图任务失败")
    } finally {
      setCreatingJob(false)
      setLoading(false)
    }
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
              onClick={() => {
                navigateToView("history")
                void refreshHistoryJobs().catch((error: Error) =>
                  toast.error(error.message),
                )
              }}
            />
            <NavButton
              active={view === "recognize"}
              href={viewHashes.recognize}
              icon={Eye}
              label="识图"
              tone="cyan"
              onClick={() => navigateToView("recognize")}
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
                isGenerating={isGenerating}
                lastJob={lastJob}
                optimizingPrompt={optimizingPrompt}
                pollingJobId={pollingJobId}
                prompt={prompt}
                quantity={quantity}
                referenceImages={referenceImages}
                resolution={resolution}
                selectedConfig={selectedConfig}
                selectedConfigId={selectedConfigId}
                onAspectRatioChange={setAspectRatio}
                onCreateJob={handleCreateJob}
                onOptimizePrompt={handleOptimizePrompt}
                onPromptChange={setPrompt}
                onQuantityChange={setQuantity}
                onReferenceImagesChange={setReferenceImages}
                onResolutionChange={setResolution}
                onRetryJob={handleRetryJob}
                onSelectedConfigChange={setSelectedConfigId}
              />
            ) : view === "history" ? (
              <HistoryPage
                historyJobs={historyJobs}
                selectedHistoryJob={selectedHistoryJob}
                selectedHistoryJobId={selectedHistoryJobId}
                deletingHistoryJobId={deletingHistoryJobId}
                onDeleteHistoryJob={deleteHistoryJob}
                onSelectHistoryJob={setSelectedHistoryJobId}
              />
            ) : view === "recognize" ? (
              <ImageRecognitionPage assistantConfig={assistantConfig} />
            ) : (
              <SettingsPage
                aiImageConfigForm={aiImageConfigForm}
                assistantForm={assistantForm}
                configFormVisible={configFormVisible}
                creatingAiConfig={creatingAiConfig}
                editingConfigId={editingConfigId}
                httpConfigDraft={httpConfigDraft}
                imageConfigForm={imageConfigForm}
                imageConfigs={imageConfigs}
                httpConfigError={httpConfigError}
                loading={loading}
                updatingAssistantEnabled={updatingAssistantEnabled}
                updatingConfigEnabledId={updatingConfigEnabledId}
                onAssistantFormChange={setAssistantForm}
                onAssistantEnabledChange={handleToggleAssistantEnabled}
                onApplyHttpSectionPreset={handleApplyHttpSectionPreset}
                onCancelConfigForm={cancelConfigForm}
                onCreateImageConfigWithAi={handleCreateImageConfigWithAi}
                onDeleteConfig={handleDeleteConfig}
                onEditConfig={startEditConfig}
                onHttpConfigDraftChange={setHttpConfigDraft}
                onAiImageConfigFormChange={setAiImageConfigForm}
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
