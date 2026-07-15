import { useState, type ReactNode } from "react"
import {
  type AiImageModelConfigRequest,
  assistantProviderModes,
  imageProviderHttpImageValueTypes,
  imageProviderHttpContentTypes,
  imageProviderDeliveryModes,
  imageProviderReferenceImageModes,
  type AssistantProviderMode,
  type CreateImageModelConfigInput,
  type ImageModelConfig,
  type ImageProviderDeliveryMode,
} from "@ai-image-codexu/shared"
import { Bot, EyeOff, Layers3, Pencil, Plus, Save, Trash2 } from "lucide-react"

import { EmptyPanel } from "@/components/empty-panel"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  createHttpExtraBodyRow,
  createHttpHeaderRow,
  createHttpOptionRow,
  type HttpConfigDraft,
  type HttpOptionFieldDraft,
} from "@/lib/http-config-draft"
import {
  imageProviderHttpPresets,
  type ImageProviderHttpPreset,
  type ImageProviderHttpSection,
} from "@/lib/image-provider-presets"
import {
  assistantModeLabels,
  providerDeliveryModeLabels,
  providerTypeLabels,
  type AssistantFormState,
} from "@/lib/image-ui"
import { cn } from "@/lib/utils"

const referenceImageModeLabels: Record<
  HttpConfigDraft["body"]["referenceImages"]["mode"],
  string
> = {
  none: "不支持",
  inlineBase64: "Base64",
  multipart: "Multipart",
  urlArray: "公网 URL",
}

const responseImageTypeLabels: Record<
  HttpConfigDraft["response"]["imageType"],
  string
> = {
  base64: "Base64",
  url: "URL",
  dataUrl: "Data URL",
}

export function SettingsPage({
  aiImageConfigForm,
  assistantForm,
  configFormVisible,
  creatingAiConfig,
  editingConfigId,
  httpConfigDraft,
  httpConfigError,
  imageConfigForm,
  imageConfigs,
  loading,
  updatingAssistantEnabled,
  updatingConfigEnabledId,
  onAssistantFormChange,
  onAssistantEnabledChange,
  onApplyHttpSectionPreset,
  onCancelConfigForm,
  onCreateImageConfigWithAi,
  onDeleteConfig,
  onEditConfig,
  onHttpConfigDraftChange,
  onAiImageConfigFormChange,
  onImageConfigFormChange,
  onSaveAssistant,
  onSaveImageConfig,
  onStartCreateConfig,
  onToggleConfigEnabled,
}: {
  aiImageConfigForm: AiImageModelConfigRequest
  assistantForm: AssistantFormState
  configFormVisible: boolean
  creatingAiConfig: boolean
  editingConfigId: string | null
  httpConfigDraft: HttpConfigDraft
  httpConfigError: string
  imageConfigForm: CreateImageModelConfigInput
  imageConfigs: ImageModelConfig[]
  loading: boolean
  updatingAssistantEnabled: boolean
  updatingConfigEnabledId: string
  onAssistantFormChange: (value: AssistantFormState) => void
  onAssistantEnabledChange: (enabled: boolean) => void
  onApplyHttpSectionPreset: (
    section: ImageProviderHttpSection,
    preset: ImageProviderHttpPreset,
  ) => void
  onCancelConfigForm: () => void
  onCreateImageConfigWithAi: () => void
  onDeleteConfig: (id: string) => void
  onEditConfig: (config: ImageModelConfig) => void
  onHttpConfigDraftChange: (value: HttpConfigDraft) => void
  onAiImageConfigFormChange: (value: AiImageModelConfigRequest) => void
  onImageConfigFormChange: (value: CreateImageModelConfigInput) => void
  onSaveAssistant: () => void
  onSaveImageConfig: () => void
  onStartCreateConfig: () => void
  onToggleConfigEnabled: (id: string, enabled: boolean) => void
}) {
  const [configFormTab, setConfigFormTab] =
    useState<"base" | "http" | "ai">("base")
  const visibleConfigFormTab =
    editingConfigId && configFormTab === "ai" ? "base" : configFormTab

  return (
    <div className="motion-stagger grid gap-3 lg:min-h-0 lg:flex-1 xl:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] xl:gap-4">
      <Card className="motion-panel surface-panel rounded-lg lg:min-h-0">
        <CardHeader className="border-b border-border/70 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers3 className="size-5 text-cyan-200" />
            模型库
          </CardTitle>
          <CardAction>
            <Button className="h-9" size="sm" onClick={onStartCreateConfig}>
              <Plus data-icon="inline-start" />
              新增
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="pt-1 lg:min-h-0 lg:overflow-auto">
          {imageConfigs.length > 0 ? (
            <div className="motion-stagger grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {imageConfigs.map((config) => {
                const switchId = `config-enabled-${config.id}`
                const isUpdating = updatingConfigEnabledId === config.id
                const requestUrl =
                  config.httpConfig?.request.url ||
                  config.modelName ||
                  config.baseUrl

                return (
                  <div
                    key={config.id}
                    className={cn(
                      "work-item group rounded-lg p-3 transition-colors",
                      "motion-hover-lift",
                      config.enabled
                        ? "border-emerald-300/25 bg-emerald-300/8 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                        : "border-border/65",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className={cn(
                              "size-2 shrink-0 rounded-full",
                              config.enabled
                                ? "bg-emerald-300 shadow-[0_0_14px_rgba(110,231,183,0.42)]"
                                : "bg-muted-foreground/45",
                            )}
                            aria-hidden="true"
                          />
                          <p className="truncate text-sm font-medium">
                            {config.name}
                          </p>
                        </div>
                        <p className="mt-2 truncate font-mono text-xs text-muted-foreground">
                          {requestUrl}
                        </p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {providerTypeLabels[config.providerType]} ·{" "}
                          {providerDeliveryModeLabels[config.deliveryMode]}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          size="icon-sm"
                          variant="outline"
                          className="size-9"
                          onClick={() => onEditConfig(config)}
                          aria-label="编辑配置"
                        >
                          <Pencil />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="destructive"
                          className="size-9"
                          onClick={() => onDeleteConfig(config.id)}
                          aria-label="删除配置"
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </div>

                    <div className="mt-3 flex min-h-10 items-center justify-between gap-3 rounded-md border border-border/60 bg-background/35 px-3">
                      <Label
                        htmlFor={switchId}
                        className="flex min-w-0 items-center gap-2 text-sm"
                      >
                        <span className="text-foreground">启用</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {config.enabled ? "已启用" : "已停用"}
                        </span>
                      </Label>
                      <Switch
                        id={switchId}
                        size="sm"
                        checked={config.enabled}
                        disabled={isUpdating}
                        onCheckedChange={(enabled) =>
                          onToggleConfigEnabled(config.id, enabled)
                        }
                        aria-label={`${config.name} 启用状态`}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <EmptyPanel icon={Layers3} title="暂无模型配置" />
          )}
        </CardContent>
      </Card>

      <Dialog
        open={configFormVisible}
        onOpenChange={(open) => {
          if (!open) {
            onCancelConfigForm()
          }
        }}
      >
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>
              {editingConfigId ? "编辑生图模型" : "新增生图模型"}
            </DialogTitle>
            <DialogDescription>
              编辑时密钥留空表示不更新。
            </DialogDescription>
          </DialogHeader>

          <div className="motion-stagger grid max-h-[calc(92vh-7rem)] gap-3 overflow-y-auto pr-1">
            <div className="grid grid-cols-3 gap-2 rounded-lg border border-border/70 bg-background/35 p-1">
              <Button
                className={cn(
                  "h-9 rounded-md",
                  visibleConfigFormTab === "base" &&
                    "border-cyan-300/30 bg-cyan-300/12 text-cyan-50",
                )}
                type="button"
                variant="ghost"
                onClick={() => setConfigFormTab("base")}
              >
                基础配置
              </Button>
              <Button
                className={cn(
                  "h-9 rounded-md",
                  visibleConfigFormTab === "http" &&
                    "border-amber-300/30 bg-amber-300/12 text-amber-50",
                )}
                type="button"
                variant="ghost"
                onClick={() => setConfigFormTab("http")}
              >
                HTTP 模板
              </Button>
              <Button
                className={cn(
                  "h-9 rounded-md",
                  visibleConfigFormTab === "ai" &&
                    "border-emerald-300/30 bg-emerald-300/12 text-emerald-50",
                )}
                type="button"
                variant="ghost"
                disabled={Boolean(editingConfigId)}
                onClick={() => setConfigFormTab("ai")}
              >
                AI 配置
              </Button>
            </div>

            {visibleConfigFormTab === "base" ? (
              <BaseConfigFields
                editingConfigId={editingConfigId}
                imageConfigForm={imageConfigForm}
                onImageConfigFormChange={onImageConfigFormChange}
              />
            ) : visibleConfigFormTab === "http" ? (
              <HttpConfigFields
                httpConfigDraft={httpConfigDraft}
                httpConfigError={httpConfigError}
                imageConfigForm={imageConfigForm}
                onApplyHttpSectionPreset={onApplyHttpSectionPreset}
                onHttpConfigDraftChange={onHttpConfigDraftChange}
              />
            ) : (
              <AiConfigFields
                aiImageConfigForm={aiImageConfigForm}
                onAiImageConfigFormChange={onAiImageConfigFormChange}
              />
            )}

            <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:justify-end">
              <Button
                className="h-10"
                variant="outline"
                onClick={onCancelConfigForm}
              >
                取消
              </Button>
              {visibleConfigFormTab === "ai" ? (
                <Button
                  className="h-10 bg-emerald-300 text-emerald-950 hover:bg-emerald-200"
                  disabled={loading || creatingAiConfig}
                  onClick={onCreateImageConfigWithAi}
                >
                  <Bot data-icon="inline-start" />
                  {creatingAiConfig ? "生成中" : "生成并保存配置"}
                </Button>
              ) : (
                <Button
                  className="h-10 bg-primary text-primary-foreground hover:bg-primary/90"
                  disabled={loading || Boolean(httpConfigError)}
                  onClick={onSaveImageConfig}
                >
                  <Save data-icon="inline-start" />
                  {editingConfigId ? "保存修改" : "保存配置"}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AssistantConfigCard
        assistantForm={assistantForm}
        loading={loading}
        updatingAssistantEnabled={updatingAssistantEnabled}
        onAssistantEnabledChange={onAssistantEnabledChange}
        onAssistantFormChange={onAssistantFormChange}
        onSaveAssistant={onSaveAssistant}
      />
    </div>
  )
}

function BaseConfigFields({
  editingConfigId,
  imageConfigForm,
  onImageConfigFormChange,
}: {
  editingConfigId: string | null
  imageConfigForm: CreateImageModelConfigInput
  onImageConfigFormChange: (value: CreateImageModelConfigInput) => void
}) {
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 md:grid-cols-2">
        <Field id="config-name" label="配置名称">
          <Input
            id="config-name"
            className="h-10 border-border/80 bg-background/55"
            value={imageConfigForm.name}
            onChange={(event) =>
              onImageConfigFormChange({
                ...imageConfigForm,
                name: event.target.value,
              })
            }
          />
        </Field>
        <Field id="delivery-mode" label="交付方式">
          <Select
            value={imageConfigForm.deliveryMode}
            onValueChange={(value) =>
              onImageConfigFormChange({
                ...imageConfigForm,
                deliveryMode: value as ImageProviderDeliveryMode,
              })
            }
          >
            <SelectTrigger id="delivery-mode" className="!h-10 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {imageProviderDeliveryModes.map((value) => (
                <SelectItem key={value} value={value}>
                  {providerDeliveryModeLabels[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Field id="model-name" label="模型快照">
          <Input
            id="model-name"
            className="h-10 border-border/80 bg-background/55"
            value={imageConfigForm.modelName ?? ""}
            onChange={(event) =>
              onImageConfigFormChange({
                ...imageConfigForm,
                modelName: event.target.value,
              })
            }
          />
        </Field>
        <Field id="api-key" label="密钥">
          <Input
            id="api-key"
            className="h-10 border-border/80 bg-background/55"
            type="password"
            placeholder={editingConfigId ? "留空表示不更新" : "只提交给后端"}
            value={imageConfigForm.apiKey}
            onChange={(event) =>
              onImageConfigFormChange({
                ...imageConfigForm,
                apiKey: event.target.value,
              })
            }
          />
        </Field>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Field id="config-enabled" label="启用配置">
          <div className="flex h-10 items-center justify-between gap-4 rounded-lg border border-border/70 bg-background/55 px-3">
            <span className="text-sm text-muted-foreground">
              {imageConfigForm.enabled ? "已启用" : "已停用"}
            </span>
            <Switch
              id="config-enabled"
              checked={imageConfigForm.enabled}
              onCheckedChange={(enabled) =>
                onImageConfigFormChange({
                  ...imageConfigForm,
                  enabled,
                })
              }
            />
          </div>
        </Field>
      </div>
    </div>
  )
}

function AiConfigFields({
  aiImageConfigForm,
  onAiImageConfigFormChange,
}: {
  aiImageConfigForm: AiImageModelConfigRequest
  onAiImageConfigFormChange: (value: AiImageModelConfigRequest) => void
}) {
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 md:grid-cols-2">
        <Field id="ai-config-name" label="配置名称">
          <Input
            id="ai-config-name"
            className="h-10 border-border/80 bg-background/55"
            value={aiImageConfigForm.configName ?? ""}
            onChange={(event) =>
              onAiImageConfigFormChange({
                ...aiImageConfigForm,
                configName: event.target.value,
              })
            }
          />
        </Field>
        <Field id="ai-model-name" label="模型快照">
          <Input
            id="ai-model-name"
            className="h-10 border-border/80 bg-background/55"
            placeholder="gemini-2.5-flash-image-preview"
            value={aiImageConfigForm.modelName ?? ""}
            onChange={(event) =>
              onAiImageConfigFormChange({
                ...aiImageConfigForm,
                modelName: event.target.value,
              })
            }
          />
        </Field>
      </div>

      <Field id="ai-source-url" label="文档地址">
        <Input
          id="ai-source-url"
          className="h-10 border-border/80 bg-background/55 font-mono text-sm"
          placeholder="https://docs.example.com/image-api"
          value={aiImageConfigForm.sourceUrl ?? ""}
          onChange={(event) =>
            onAiImageConfigFormChange({
              ...aiImageConfigForm,
              sourceUrl: event.target.value,
            })
          }
        />
      </Field>

      <Field id="ai-source-text" label="文档信息">
        <Textarea
          id="ai-source-text"
          className="min-h-[260px] resize-y border-border/80 bg-background/55 font-mono text-xs leading-5"
          spellCheck={false}
          value={aiImageConfigForm.sourceText ?? ""}
          onChange={(event) =>
            onAiImageConfigFormChange({
              ...aiImageConfigForm,
              sourceText: event.target.value,
            })
          }
        />
      </Field>
    </div>
  )
}

function HttpConfigFields({
  httpConfigDraft,
  httpConfigError,
  imageConfigForm,
  onApplyHttpSectionPreset,
  onHttpConfigDraftChange,
}: {
  httpConfigDraft: HttpConfigDraft
  httpConfigError: string
  imageConfigForm: CreateImageModelConfigInput
  onApplyHttpSectionPreset: (
    section: ImageProviderHttpSection,
    preset: ImageProviderHttpPreset,
  ) => void
  onHttpConfigDraftChange: (value: HttpConfigDraft) => void
}) {
  function updateRequest(value: Partial<HttpConfigDraft["request"]>) {
    onHttpConfigDraftChange({
      ...httpConfigDraft,
      request: {
        ...httpConfigDraft.request,
        ...value,
      },
    })
  }

  function updateBody(value: HttpConfigDraft["body"]) {
    onHttpConfigDraftChange({
      ...httpConfigDraft,
      body: value,
    })
  }

  function updateHeaders(value: HttpConfigDraft["headers"]) {
    onHttpConfigDraftChange({
      ...httpConfigDraft,
      headers: value,
    })
  }

  function updateResponse(value: HttpConfigDraft["response"]) {
    onHttpConfigDraftChange({
      ...httpConfigDraft,
      response: value,
    })
  }

  function updatePolling(value: HttpConfigDraft["polling"]) {
    onHttpConfigDraftChange({
      ...httpConfigDraft,
      polling: value,
    })
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_120px_150px]">
        <Field id="http-request-url" label="请求地址">
          <Input
            id="http-request-url"
            className="h-10 border-border/80 bg-background/55 font-mono text-sm"
            value={httpConfigDraft.request.url}
            onChange={(event) => updateRequest({ url: event.target.value })}
          />
        </Field>
        <Field id="http-request-method" label="方法">
          <Select
            value={httpConfigDraft.request.method}
            onValueChange={(value) =>
              updateRequest({
                method: value as HttpConfigDraft["request"]["method"],
              })
            }
          >
            <SelectTrigger id="http-request-method" className="!h-10 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["POST", "GET"].map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field id="http-content-type" label="Content-Type">
          <Select
            value={httpConfigDraft.request.contentType}
            onValueChange={(value) =>
              updateRequest({
                contentType: value as HttpConfigDraft["request"]["contentType"],
              })
            }
          >
            <SelectTrigger id="http-content-type" className="!h-10 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {imageProviderHttpContentTypes.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <HttpFormSection
        section="headers"
        title="请求头"
        onApplyHttpSectionPreset={onApplyHttpSectionPreset}
      >
        <HttpHeadersForm
          headers={httpConfigDraft.headers}
          onChange={updateHeaders}
        />
      </HttpFormSection>

      <HttpFormSection
        section="body"
        title="请求体"
        onApplyHttpSectionPreset={onApplyHttpSectionPreset}
      >
        <HttpBodyForm body={httpConfigDraft.body} onChange={updateBody} />
      </HttpFormSection>

      <HttpFormSection
        section="response"
        title="返回格式"
        onApplyHttpSectionPreset={onApplyHttpSectionPreset}
      >
        <HttpResponseForm
          response={httpConfigDraft.response}
          onChange={updateResponse}
        />
      </HttpFormSection>

      {imageConfigForm.deliveryMode === "polling" ? (
        <HttpPollingForm
          polling={httpConfigDraft.polling}
          onChange={updatePolling}
        />
      ) : null}

      {httpConfigError ? (
        <p className="rounded-md border border-red-300/35 bg-red-500/10 px-3 py-2 text-sm text-red-100">
          {httpConfigError}
        </p>
      ) : null}
    </div>
  )
}

function HttpFormSection({
  children,
  section,
  title,
  onApplyHttpSectionPreset,
}: {
  children: ReactNode
  section: ImageProviderHttpSection
  title: string
  onApplyHttpSectionPreset: (
    section: ImageProviderHttpSection,
    preset: ImageProviderHttpPreset,
  ) => void
}) {
  return (
    <div className="grid gap-2 rounded-lg border border-border/70 bg-background/30 p-3">
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        <div className="flex gap-2">
          {imageProviderHttpPresets.map((preset) => (
            <Button
              key={preset.id}
              className="h-8 px-3 text-xs"
              type="button"
              variant="outline"
              onClick={() => onApplyHttpSectionPreset(section, preset)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </div>
      {children}
    </div>
  )
}

function HttpHeadersForm({
  headers,
  onChange,
}: {
  headers: HttpConfigDraft["headers"]
  onChange: (value: HttpConfigDraft["headers"]) => void
}) {
  function updateRow(
    id: string,
    value: Partial<HttpConfigDraft["headers"][number]>,
  ) {
    onChange(headers.map((row) => (row.id === id ? { ...row, ...value } : row)))
  }

  function removeRow(id: string) {
    const nextRows = headers.filter((row) => row.id !== id)
    onChange(nextRows.length > 0 ? nextRows : [createHttpHeaderRow()])
  }

  return (
    <div className="grid gap-2">
      {headers.map((row) => (
        <div
          key={row.id}
          className="grid gap-2 md:grid-cols-[minmax(150px,0.8fr)_minmax(0,1.4fr)_36px]"
        >
          <Input
            className="h-9 border-border/80 bg-background/55 font-mono text-sm"
            placeholder="Authorization"
            value={row.name}
            onChange={(event) => updateRow(row.id, { name: event.target.value })}
          />
          <Input
            className="h-9 border-border/80 bg-background/55 font-mono text-sm"
            placeholder="Bearer {{apiKey}}"
            value={row.value}
            onChange={(event) => updateRow(row.id, { value: event.target.value })}
          />
          <Button
            className="size-9"
            type="button"
            variant="destructive"
            size="icon-sm"
            onClick={() => removeRow(row.id)}
            aria-label="删除请求头"
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      <Button
        className="h-8 justify-self-start"
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...headers, createHttpHeaderRow()])}
      >
        <Plus data-icon="inline-start" />
        添加请求头
      </Button>
    </div>
  )
}

function HttpBodyForm({
  body,
  onChange,
}: {
  body: HttpConfigDraft["body"]
  onChange: (value: HttpConfigDraft["body"]) => void
}) {
  function updateBody(value: Partial<HttpConfigDraft["body"]>) {
    onChange({
      ...body,
      ...value,
    })
  }

  return (
    <div className="grid gap-3">
      <Field id="http-prompt-path" label="提示词路径">
        <Input
          id="http-prompt-path"
          className="h-9 border-border/80 bg-background/55 font-mono text-sm"
          placeholder="contents[0].parts[0].text"
          value={body.promptPath}
          onChange={(event) => updateBody({ promptPath: event.target.value })}
        />
      </Field>

      <div className="grid gap-3 lg:grid-cols-2">
        <HttpOptionFieldForm
          title="尺寸比例"
          pathInputId="http-aspect-ratio-path"
          field={body.aspectRatio}
          onChange={(aspectRatio) => updateBody({ aspectRatio })}
        />
        <HttpOptionFieldForm
          title="分辨率"
          pathInputId="http-resolution-path"
          field={body.resolution}
          onChange={(resolution) => updateBody({ resolution })}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <HttpQuantityForm
          quantity={body.quantity}
          onChange={(quantity) => updateBody({ quantity })}
        />
        <HttpReferenceImagesForm
          referenceImages={body.referenceImages}
          onChange={(referenceImages) => updateBody({ referenceImages })}
        />
      </div>

      <HttpExtraBodyForm
        extra={body.extra}
        onChange={(extra) => updateBody({ extra })}
      />
    </div>
  )
}

function HttpOptionFieldForm({
  field,
  pathInputId,
  title,
  onChange,
}: {
  field: HttpOptionFieldDraft
  pathInputId: string
  title: string
  onChange: (value: HttpOptionFieldDraft) => void
}) {
  function updateOption(
    id: string,
    value: Partial<HttpOptionFieldDraft["options"][number]>,
  ) {
    onChange({
      ...field,
      options: field.options.map((option) =>
        option.id === id ? { ...option, ...value } : option,
      ),
    })
  }

  return (
    <div className="grid gap-2 rounded-lg border border-border/60 bg-background/30 p-3">
      <div className="flex min-h-8 items-center justify-between gap-2">
        <Label htmlFor={pathInputId} className="text-sm text-foreground">
          {title}
        </Label>
        <Button
          className="h-8 px-2"
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            onChange({
              ...field,
              options: [...field.options, createHttpOptionRow()],
            })
          }
        >
          <Plus data-icon="inline-start" />
          选项
        </Button>
      </div>
      <Input
        id={pathInputId}
        className="h-9 border-border/80 bg-background/55 font-mono text-sm"
        placeholder="generationConfig.imageConfig.aspectRatio"
        value={field.path}
        onChange={(event) => onChange({ ...field, path: event.target.value })}
      />
      <div className="grid gap-2">
        {field.options.map((option) => (
          <div
            key={option.id}
            className="grid gap-2 md:grid-cols-[minmax(92px,0.7fr)_minmax(0,1fr)_36px]"
          >
            <Input
              className="h-9 border-border/80 bg-background/55 text-sm"
              placeholder="显示值"
              value={option.label}
              onChange={(event) =>
                updateOption(option.id, { label: event.target.value })
              }
            />
            <Input
              className="h-9 border-border/80 bg-background/55 font-mono text-sm"
              placeholder="发送值"
              value={option.valueText}
              onChange={(event) =>
                updateOption(option.id, { valueText: event.target.value })
              }
            />
            <Button
              className="size-9"
              type="button"
              variant="destructive"
              size="icon-sm"
              onClick={() =>
                onChange({
                  ...field,
                  options: field.options.filter((item) => item.id !== option.id),
                })
              }
              aria-label={`删除${title}选项`}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}

function HttpQuantityForm({
  quantity,
  onChange,
}: {
  quantity: HttpConfigDraft["body"]["quantity"]
  onChange: (value: HttpConfigDraft["body"]["quantity"]) => void
}) {
  function updateQuantity(value: Partial<HttpConfigDraft["body"]["quantity"]>) {
    onChange({
      ...quantity,
      ...value,
    })
  }

  return (
    <div className="grid gap-2 rounded-lg border border-border/60 bg-background/30 p-3">
      <div className="flex min-h-8 items-center justify-between gap-3">
        <Label htmlFor="http-quantity-path" className="text-sm text-foreground">
          生成数量
        </Label>
        <Switch
          checked={quantity.enabled}
          onCheckedChange={(enabled) => updateQuantity({ enabled })}
          aria-label="启用数量参数"
        />
      </div>
      <Input
        id="http-quantity-path"
        className="h-9 border-border/80 bg-background/55 font-mono text-sm"
        placeholder="n"
        value={quantity.path}
        onChange={(event) => updateQuantity({ path: event.target.value })}
      />
      <div className="grid grid-cols-3 gap-2">
        <Field id="http-quantity-min" label="下限">
          <Input
            id="http-quantity-min"
            className="h-9 border-border/80 bg-background/55"
            type="number"
            min={1}
            max={16}
            value={quantity.min}
            onChange={(event) => updateQuantity({ min: event.target.value })}
          />
        </Field>
        <Field id="http-quantity-max" label="上限">
          <Input
            id="http-quantity-max"
            className="h-9 border-border/80 bg-background/55"
            type="number"
            min={1}
            max={16}
            value={quantity.max}
            onChange={(event) => updateQuantity({ max: event.target.value })}
          />
        </Field>
        <Field id="http-quantity-default" label="默认">
          <Input
            id="http-quantity-default"
            className="h-9 border-border/80 bg-background/55"
            type="number"
            min={1}
            max={16}
            value={quantity.defaultValue}
            onChange={(event) =>
              updateQuantity({ defaultValue: event.target.value })
            }
          />
        </Field>
      </div>
    </div>
  )
}

function HttpReferenceImagesForm({
  referenceImages,
  onChange,
}: {
  referenceImages: HttpConfigDraft["body"]["referenceImages"]
  onChange: (value: HttpConfigDraft["body"]["referenceImages"]) => void
}) {
  function updateReferenceImages(
    value: Partial<HttpConfigDraft["body"]["referenceImages"]>,
  ) {
    onChange({
      ...referenceImages,
      ...value,
    })
  }

  return (
    <div className="grid gap-2 rounded-lg border border-border/60 bg-background/30 p-3">
      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_96px]">
        <Field id="http-reference-mode" label="参考图">
          <Select
            value={referenceImages.mode}
            onValueChange={(value) =>
              updateReferenceImages({
                mode: value as HttpConfigDraft["body"]["referenceImages"]["mode"],
              })
            }
          >
            <SelectTrigger id="http-reference-mode" className="!h-9 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {imageProviderReferenceImageModes.map((value) => (
                <SelectItem key={value} value={value}>
                  {referenceImageModeLabels[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field id="http-reference-max" label="上限">
          <Input
            id="http-reference-max"
            className="h-9 border-border/80 bg-background/55"
            type="number"
            min={0}
            max={16}
            value={referenceImages.maxCount}
            onChange={(event) =>
              updateReferenceImages({ maxCount: event.target.value })
            }
          />
        </Field>
      </div>

      {referenceImages.mode === "inlineBase64" ||
      referenceImages.mode === "urlArray" ? (
        <Field id="http-reference-path" label="写入路径">
          <Input
            id="http-reference-path"
            className="h-9 border-border/80 bg-background/55 font-mono text-sm"
            placeholder="contents[0].parts[]"
            value={referenceImages.path}
            onChange={(event) =>
              updateReferenceImages({ path: event.target.value })
            }
          />
        </Field>
      ) : null}

      {referenceImages.mode === "multipart" ? (
        <Field id="http-reference-field" label="文件字段名">
          <Input
            id="http-reference-field"
            className="h-9 border-border/80 bg-background/55 font-mono text-sm"
            placeholder="image"
            value={referenceImages.fieldName}
            onChange={(event) =>
              updateReferenceImages({ fieldName: event.target.value })
            }
          />
        </Field>
      ) : null}

      {referenceImages.mode === "inlineBase64" ? (
        <Field id="http-reference-template" label="参考图模板">
          <Textarea
            id="http-reference-template"
            className="min-h-[108px] resize-y border-border/80 bg-background/55 font-mono text-xs leading-5"
            spellCheck={false}
            value={referenceImages.templateText}
            onChange={(event) =>
              updateReferenceImages({ templateText: event.target.value })
            }
          />
        </Field>
      ) : null}
    </div>
  )
}

function HttpExtraBodyForm({
  extra,
  onChange,
}: {
  extra: HttpConfigDraft["body"]["extra"]
  onChange: (value: HttpConfigDraft["body"]["extra"]) => void
}) {
  function updateRow(
    id: string,
    value: Partial<HttpConfigDraft["body"]["extra"][number]>,
  ) {
    onChange(extra.map((row) => (row.id === id ? { ...row, ...value } : row)))
  }

  return (
    <div className="grid gap-2 rounded-lg border border-border/60 bg-background/30 p-3">
      <div className="flex min-h-8 items-center justify-between gap-2">
        <h4 className="text-sm font-medium text-foreground">额外参数</h4>
        <Button
          className="h-8 px-2"
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...extra, createHttpExtraBodyRow()])}
        >
          <Plus data-icon="inline-start" />
          参数
        </Button>
      </div>
      {extra.map((row) => (
        <div
          key={row.id}
          className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_36px]"
        >
          <Input
            className="h-9 border-border/80 bg-background/55 font-mono text-sm"
            placeholder="generationConfig.responseModalities"
            value={row.path}
            onChange={(event) => updateRow(row.id, { path: event.target.value })}
          />
          <Input
            className="h-9 border-border/80 bg-background/55 font-mono text-sm"
            placeholder='["IMAGE"]'
            value={row.valueText}
            onChange={(event) =>
              updateRow(row.id, { valueText: event.target.value })
            }
          />
          <Button
            className="size-9"
            type="button"
            variant="destructive"
            size="icon-sm"
            onClick={() => onChange(extra.filter((item) => item.id !== row.id))}
            aria-label="删除额外参数"
          >
            <Trash2 />
          </Button>
        </div>
      ))}
    </div>
  )
}

function HttpResponseForm({
  response,
  onChange,
}: {
  response: HttpConfigDraft["response"]
  onChange: (value: HttpConfigDraft["response"]) => void
}) {
  function updateResponse(value: Partial<HttpConfigDraft["response"]>) {
    onChange({
      ...response,
      ...value,
    })
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 md:grid-cols-[160px_minmax(0,1fr)]">
        <Field id="http-response-type" label="图片类型">
          <Select
            value={response.imageType}
            onValueChange={(value) =>
              updateResponse({
                imageType: value as HttpConfigDraft["response"]["imageType"],
              })
            }
          >
            <SelectTrigger id="http-response-type" className="!h-9 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {imageProviderHttpImageValueTypes.map((value) => (
                <SelectItem key={value} value={value}>
                  {responseImageTypeLabels[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {response.imageType === "url" ? (
          <Field id="http-response-url-path" label="URL 路径">
            <Input
              id="http-response-url-path"
              className="h-9 border-border/80 bg-background/55 font-mono text-sm"
              placeholder="data[].url"
              value={response.urlPath}
              onChange={(event) =>
                updateResponse({ urlPath: event.target.value })
              }
            />
          </Field>
        ) : (
          <Field id="http-response-data-path" label="数据路径">
            <Input
              id="http-response-data-path"
              className="h-9 border-border/80 bg-background/55 font-mono text-sm"
              placeholder="candidates[].content.parts[].inlineData.data"
              value={response.dataPath}
              onChange={(event) =>
                updateResponse({ dataPath: event.target.value })
              }
            />
          </Field>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Field id="http-response-mime-path" label="MIME 路径">
          <Input
            id="http-response-mime-path"
            className="h-9 border-border/80 bg-background/55 font-mono text-sm"
            placeholder="inlineData.mimeType"
            value={response.mimeTypePath}
            onChange={(event) =>
              updateResponse({ mimeTypePath: event.target.value })
            }
          />
        </Field>
        <Field id="http-response-mime" label="固定 MIME">
          <Input
            id="http-response-mime"
            className="h-9 border-border/80 bg-background/55 font-mono text-sm"
            placeholder="image/png"
            value={response.mimeType}
            onChange={(event) => updateResponse({ mimeType: event.target.value })}
          />
        </Field>
        <Field id="http-response-token-path" label="总 Token 路径">
          <Input
            id="http-response-token-path"
            className="h-9 border-border/80 bg-background/55 font-mono text-sm"
            placeholder="usageMetadata.totalTokenCount"
            value={response.totalTokensPath}
            onChange={(event) =>
              updateResponse({ totalTokensPath: event.target.value })
            }
          />
        </Field>
        <Field id="http-response-input-token-path" label="输入 Token 路径">
          <Input
            id="http-response-input-token-path"
            className="h-9 border-border/80 bg-background/55 font-mono text-sm"
            placeholder="usageMetadata.promptTokenCount"
            value={response.inputTokensPath}
            onChange={(event) =>
              updateResponse({ inputTokensPath: event.target.value })
            }
          />
        </Field>
        <Field id="http-response-output-token-path" label="输出 Token 路径">
          <Input
            id="http-response-output-token-path"
            className="h-9 border-border/80 bg-background/55 font-mono text-sm"
            placeholder="usageMetadata.candidatesTokenCount"
            value={response.outputTokensPath}
            onChange={(event) =>
              updateResponse({ outputTokensPath: event.target.value })
            }
          />
        </Field>
      </div>
    </div>
  )
}

function HttpPollingForm({
  polling,
  onChange,
}: {
  polling: HttpConfigDraft["polling"]
  onChange: (value: HttpConfigDraft["polling"]) => void
}) {
  function updatePolling(value: Partial<HttpConfigDraft["polling"]>) {
    onChange({
      ...polling,
      ...value,
    })
  }

  function updateRequest(value: Partial<HttpConfigDraft["polling"]["request"]>) {
    updatePolling({
      request: {
        ...polling.request,
        ...value,
      },
    })
  }

  return (
    <div className="grid gap-2 rounded-lg border border-border/70 bg-background/30 p-3">
      <div className="flex min-h-8 items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-foreground">轮询配置</h3>
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_120px_150px]">
        <Field id="http-polling-url" label="轮询地址">
          <Input
            id="http-polling-url"
            className="h-9 border-border/80 bg-background/55 font-mono text-sm"
            placeholder="https://api.example.com/v1/tasks/{{taskId}}"
            value={polling.request.url}
            onChange={(event) => updateRequest({ url: event.target.value })}
          />
        </Field>
        <Field id="http-polling-method" label="方法">
          <Select
            value={polling.request.method}
            onValueChange={(value) =>
              updateRequest({
                method: value as HttpConfigDraft["polling"]["request"]["method"],
              })
            }
          >
            <SelectTrigger id="http-polling-method" className="!h-9 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["GET", "POST"].map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field id="http-polling-content-type" label="Content-Type">
          <Select
            value={polling.request.contentType}
            onValueChange={(value) =>
              updateRequest({
                contentType:
                  value as HttpConfigDraft["polling"]["request"]["contentType"],
              })
            }
          >
            <SelectTrigger
              id="http-polling-content-type"
              className="!h-9 w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {imageProviderHttpContentTypes.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="grid gap-2 rounded-lg border border-border/60 bg-background/30 p-3">
        <h4 className="text-sm font-medium text-foreground">轮询请求头</h4>
        <HttpHeadersForm
          headers={polling.headers}
          onChange={(headers) => updatePolling({ headers })}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Field id="http-polling-task-id" label="任务 ID 路径">
          <Input
            id="http-polling-task-id"
            className="h-9 border-border/80 bg-background/55 font-mono text-sm"
            placeholder="id"
            value={polling.taskIdPath}
            onChange={(event) =>
              updatePolling({ taskIdPath: event.target.value })
            }
          />
        </Field>
        <Field id="http-polling-status" label="状态路径">
          <Input
            id="http-polling-status"
            className="h-9 border-border/80 bg-background/55 font-mono text-sm"
            placeholder="status"
            value={polling.statusPath}
            onChange={(event) =>
              updatePolling({ statusPath: event.target.value })
            }
          />
        </Field>
        <Field id="http-polling-success" label="成功值">
          <Input
            id="http-polling-success"
            className="h-9 border-border/80 bg-background/55 font-mono text-sm"
            placeholder="completed"
            value={polling.successValue}
            onChange={(event) =>
              updatePolling({ successValue: event.target.value })
            }
          />
        </Field>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Field id="http-polling-failure" label="失败值">
          <Input
            id="http-polling-failure"
            className="h-9 border-border/80 bg-background/55 font-mono text-sm"
            placeholder="failed"
            value={polling.failureValue}
            onChange={(event) =>
              updatePolling({ failureValue: event.target.value })
            }
          />
        </Field>
        <Field id="http-polling-interval" label="间隔 ms">
          <Input
            id="http-polling-interval"
            className="h-9 border-border/80 bg-background/55"
            type="number"
            min={1000}
            max={60000}
            value={polling.intervalMs}
            onChange={(event) =>
              updatePolling({ intervalMs: event.target.value })
            }
          />
        </Field>
        <Field id="http-polling-timeout" label="超时 ms">
          <Input
            id="http-polling-timeout"
            className="h-9 border-border/80 bg-background/55"
            type="number"
            min={10000}
            max={600000}
            value={polling.timeoutMs}
            onChange={(event) =>
              updatePolling({ timeoutMs: event.target.value })
            }
          />
        </Field>
      </div>

      <div className="flex min-h-10 items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/35 px-3">
        <Label
          htmlFor="http-polling-custom-response"
          className="text-sm text-foreground"
        >
          独立返回格式
        </Label>
        <Switch
          id="http-polling-custom-response"
          checked={polling.useCustomResponse}
          onCheckedChange={(useCustomResponse) =>
            updatePolling({ useCustomResponse })
          }
        />
      </div>

      {polling.useCustomResponse ? (
        <HttpResponseForm
          response={polling.response}
          onChange={(response) => updatePolling({ response })}
        />
      ) : null}
    </div>
  )
}

function AssistantConfigCard({
  assistantForm,
  loading,
  updatingAssistantEnabled,
  onAssistantEnabledChange,
  onAssistantFormChange,
  onSaveAssistant,
}: {
  assistantForm: AssistantFormState
  loading: boolean
  updatingAssistantEnabled: boolean
  onAssistantEnabledChange: (enabled: boolean) => void
  onAssistantFormChange: (value: AssistantFormState) => void
  onSaveAssistant: () => void
}) {
  return (
    <Card className="motion-panel surface-panel rounded-lg lg:min-h-0 xl:self-start">
      <CardHeader className="border-b border-border/70 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bot className="size-5 text-amber-200" />
          辅助模型
        </CardTitle>
      </CardHeader>
      <CardContent className="motion-stagger grid gap-3 pt-1">
        <Field id="assistant-mode" label="模式">
          <Select
            value={assistantForm.mode}
            onValueChange={(value) =>
              onAssistantFormChange({
                ...assistantForm,
                mode: value as AssistantProviderMode,
              })
            }
          >
            <SelectTrigger id="assistant-mode" className="!h-10 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {assistantProviderModes.map((value) => (
                <SelectItem key={value} value={value}>
                  {assistantModeLabels[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field id="assistant-url" label="请求地址">
          <Input
            id="assistant-url"
            className="h-10 border-border/80 bg-background/55 font-mono text-sm"
            placeholder="https://third-party.example.com/v1/chat/completions"
            value={assistantForm.url}
            onChange={(event) =>
              onAssistantFormChange({
                ...assistantForm,
                url: event.target.value,
              })
            }
          />
        </Field>

        <Field id="assistant-key" label="密钥">
          <Input
            id="assistant-key"
            className="h-10 border-border/80 bg-background/55"
            type="password"
            placeholder="留空表示不更新"
            value={assistantForm.apiKey}
            onChange={(event) =>
              onAssistantFormChange({
                ...assistantForm,
                apiKey: event.target.value,
              })
            }
          />
        </Field>

        <Field id="assistant-model" label="模型名">
          <Input
            id="assistant-model"
            className="h-10 border-border/80 bg-background/55"
            placeholder="gpt-4.1-mini"
            value={assistantForm.modelName}
            onChange={(event) =>
              onAssistantFormChange({
                ...assistantForm,
                modelName: event.target.value,
              })
            }
          />
        </Field>

        <Field id="assistant-enabled" label="启用辅助模型">
          <div className="flex h-10 items-center justify-between gap-4 rounded-lg border border-border/70 bg-background/55 px-3">
            <span className="text-sm text-muted-foreground">
              {assistantForm.enabled ? "已启用" : "已停用"}
            </span>
            <Switch
              id="assistant-enabled"
              checked={assistantForm.enabled}
              disabled={loading || updatingAssistantEnabled}
              onCheckedChange={onAssistantEnabledChange}
            />
          </div>
        </Field>

        <Button
          className="h-10 bg-amber-300 text-amber-950 hover:bg-amber-200"
          disabled={loading}
          onClick={onSaveAssistant}
        >
          <Bot data-icon="inline-start" />
          保存辅助模型
        </Button>

        <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-muted/35 p-3 text-sm leading-6 text-muted-foreground">
          <EyeOff className="mt-1 size-4 shrink-0 text-amber-200" />
          <p>前端只展示密钥掩码，不保存或回显原始 API key。</p>
        </div>
      </CardContent>
    </Card>
  )
}

function Field({
  children,
  id,
  label,
}: {
  children: ReactNode
  id: string
  label: string
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id} className="text-sm text-foreground">
        {label}
      </Label>
      {children}
    </div>
  )
}
