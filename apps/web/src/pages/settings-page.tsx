import type { ReactNode } from "react"
import {
  assistantProviderModes,
  imageModelTypes,
  type AssistantProviderMode,
  type CreateImageModelConfigInput,
  type ImageModelConfig,
  type ImageModelType,
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
import {
  assistantModeLabels,
  modelLabels,
  type AssistantFormState,
} from "@/lib/image-ui"

export function SettingsPage({
  assistantForm,
  configFormVisible,
  editingConfigId,
  imageConfigForm,
  imageConfigs,
  loading,
  onAssistantFormChange,
  onCancelConfigForm,
  onDeleteConfig,
  onEditConfig,
  onImageConfigFormChange,
  onSaveAssistant,
  onSaveImageConfig,
  onStartCreateConfig,
}: {
  assistantForm: AssistantFormState
  configFormVisible: boolean
  editingConfigId: string | null
  imageConfigForm: CreateImageModelConfigInput
  imageConfigs: ImageModelConfig[]
  loading: boolean
  onAssistantFormChange: (value: AssistantFormState) => void
  onCancelConfigForm: () => void
  onDeleteConfig: (id: string) => void
  onEditConfig: (config: ImageModelConfig) => void
  onImageConfigFormChange: (value: CreateImageModelConfigInput) => void
  onSaveAssistant: () => void
  onSaveImageConfig: () => void
  onStartCreateConfig: () => void
}) {
  return (
    <div className="grid gap-4 lg:min-h-0 lg:flex-1 xl:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
      <Card className="surface-panel rounded-lg lg:min-h-0">
        <CardHeader className="border-b border-border/70 pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
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
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {imageConfigs.map((config) => (
                <div
                  key={config.id}
                  className="rounded-lg border border-border/70 bg-background/45 p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{config.name}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {config.modelNameOverride || modelLabels[config.modelType]}
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
                </div>
              ))}
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
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {editingConfigId ? "编辑生图模型" : "新增生图模型"}
            </DialogTitle>
            <DialogDescription>
              编辑时密钥留空表示不更新。
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="grid gap-3 md:grid-cols-2">
              <Field id="config-name" label="配置名称">
                <Input
                  id="config-name"
                  className="h-10 border-border/80 bg-background/55"
                  placeholder="例如：OpenAI 中转"
                  value={imageConfigForm.name}
                  onChange={(event) =>
                    onImageConfigFormChange({
                      ...imageConfigForm,
                      name: event.target.value,
                    })
                  }
                />
              </Field>
              <Field id="model-type" label="模型类型">
                <Select
                  value={imageConfigForm.modelType}
                  onValueChange={(value) =>
                    onImageConfigFormChange({
                      ...imageConfigForm,
                      modelType: value as ImageModelType,
                    })
                  }
                >
                  <SelectTrigger id="model-type" className="!h-10 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {imageModelTypes.map((value) => (
                      <SelectItem key={value} value={value}>
                        {modelLabels[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <Field id="base-url" label="请求地址">
                <Input
                  id="base-url"
                  className="h-10 border-border/80 bg-background/55 font-mono text-sm"
                  placeholder="https://third-party.example.com/v1/images"
                  value={imageConfigForm.baseUrl}
                  onChange={(event) =>
                    onImageConfigFormChange({
                      ...imageConfigForm,
                      baseUrl: event.target.value,
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

            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px] md:items-end">
              <Field id="model-name-override" label="模型名 Override">
                <Input
                  id="model-name-override"
                  className="h-10 border-border/80 bg-background/55"
                  placeholder="可选，例如 gemini-3.1-flash-image"
                  value={imageConfigForm.modelNameOverride}
                  onChange={(event) =>
                    onImageConfigFormChange({
                      ...imageConfigForm,
                      modelNameOverride: event.target.value,
                    })
                  }
                />
              </Field>
              <div className="flex h-10 items-center justify-between gap-4 rounded-lg border border-border/70 bg-background/45 px-3">
                <Label className="text-sm text-foreground">启用配置</Label>
                <Switch
                  checked={imageConfigForm.enabled}
                  onCheckedChange={(enabled) =>
                    onImageConfigFormChange({
                      ...imageConfigForm,
                      enabled,
                    })
                  }
                />
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:justify-end">
              <Button
                className="h-10"
                variant="outline"
                onClick={onCancelConfigForm}
              >
                取消
              </Button>
              <Button
                className="h-10 bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={loading}
                onClick={onSaveImageConfig}
              >
                <Save data-icon="inline-start" />
                {editingConfigId ? "保存修改" : "保存配置"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Card className="surface-panel rounded-lg lg:min-h-0 xl:self-start">
        <CardHeader className="border-b border-border/70 pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Bot className="size-5 text-amber-200" />
            辅助模型
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 pt-1">
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
              value={assistantForm.baseUrl}
              onChange={(event) =>
                onAssistantFormChange({
                  ...assistantForm,
                  baseUrl: event.target.value,
                })
              }
            />
          </Field>

          <Field id="assistant-key" label="密钥">
            <Input
              id="assistant-key"
              className="h-10 border-border/80 bg-background/55"
              type="password"
              placeholder="留空表示不更新密钥"
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
              placeholder="例如 gpt-4.1-mini 或 claude-sonnet-4"
              value={assistantForm.modelName}
              onChange={(event) =>
                onAssistantFormChange({
                  ...assistantForm,
                  modelName: event.target.value,
                })
              }
            />
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
    </div>
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
      <FieldLabel id={id}>{label}</FieldLabel>
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
