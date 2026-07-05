import type {
  ImageProviderDeliveryMode,
  ImageProviderHttpBodyConfig,
  ImageProviderHttpConfig,
  ImageProviderHttpContentType,
  ImageProviderHttpImageValueType,
  ImageProviderHttpResponse,
  ImageProviderReferenceImageMode,
  JsonValue,
} from "@ai-image-codexu/shared"

import type { ImageProviderHttpSection } from "@/lib/image-provider-presets"

export type HttpHeaderDraftRow = {
  id: string
  name: string
  value: string
}

export type HttpOptionDraftRow = {
  id: string
  label: string
  valueText: string
}

export type HttpExtraBodyDraftRow = {
  id: string
  path: string
  valueText: string
}

export type HttpOptionFieldDraft = {
  path: string
  options: HttpOptionDraftRow[]
}

export type HttpConfigDraft = {
  request: {
    method: ImageProviderHttpConfig["request"]["method"]
    url: string
    contentType: ImageProviderHttpContentType
  }
  headers: HttpHeaderDraftRow[]
  body: {
    promptPath: string
    aspectRatio: HttpOptionFieldDraft
    resolution: HttpOptionFieldDraft
    quantity: {
      enabled: boolean
      path: string
      min: string
      max: string
      defaultValue: string
    }
    referenceImages: {
      mode: ImageProviderReferenceImageMode
      maxCount: string
      path: string
      fieldName: string
      templateText: string
    }
    extra: HttpExtraBodyDraftRow[]
  }
  response: {
    imageType: ImageProviderHttpImageValueType
    dataPath: string
    urlPath: string
    mimeTypePath: string
    mimeType: string
    totalTokensPath: string
    inputTokensPath: string
    outputTokensPath: string
  }
  polling: {
    request: {
      method: ImageProviderHttpConfig["request"]["method"]
      url: string
      contentType: ImageProviderHttpContentType
    }
    headers: HttpHeaderDraftRow[]
    taskIdPath: string
    statusPath: string
    successValue: string
    failureValue: string
    intervalMs: string
    timeoutMs: string
    useCustomResponse: boolean
    response: HttpConfigDraft["response"]
  }
}

export type BuildHttpConfigDraftResult = {
  config?: ImageProviderHttpConfig
  errors: string[]
}

type HttpBodyOptionSource = NonNullable<
  NonNullable<ImageProviderHttpBodyConfig["aspectRatio"]>["options"]
>[number]

let draftIdSeed = 0

export function createHttpHeaderRow(
  name = "",
  value = "",
): HttpHeaderDraftRow {
  return {
    id: createDraftId("header"),
    name,
    value,
  }
}

export function createHttpOptionRow(
  label = "",
  valueText = "",
): HttpOptionDraftRow {
  return {
    id: createDraftId("option"),
    label,
    valueText,
  }
}

export function createHttpExtraBodyRow(
  path = "",
  valueText = "",
): HttpExtraBodyDraftRow {
  return {
    id: createDraftId("extra"),
    path,
    valueText,
  }
}

export function createHttpConfigDraft(
  config: ImageProviderHttpConfig,
): HttpConfigDraft {
  const body = isHttpBodyConfig(config.request.body)
    ? config.request.body
    : undefined
  const referenceImages = body?.referenceImages ?? config.referenceImages

  return {
    request: {
      method: config.request.method ?? "POST",
      url: config.request.url ?? "",
      contentType: config.request.contentType ?? "json",
    },
    headers: createHeaderRows(config.request.headers),
    body: {
      promptPath: body?.prompt?.path ?? "",
      aspectRatio: createOptionFieldDraft(body?.aspectRatio),
      resolution: createOptionFieldDraft(body?.resolution),
      quantity: {
        enabled: body?.quantity?.enabled ?? Boolean(body?.quantity?.path),
        path: body?.quantity?.path ?? "",
        min: numberToDraftText(body?.quantity?.min, 1),
        max: numberToDraftText(body?.quantity?.max, 3),
        defaultValue: numberToDraftText(body?.quantity?.defaultValue, 1),
      },
      referenceImages: {
        mode: referenceImages?.mode ?? "none",
        maxCount: numberToDraftText(referenceImages?.maxCount, 16),
        path: referenceImages?.path ?? "",
        fieldName: referenceImages?.fieldName ?? "",
        templateText: formatJsonTemplate(referenceImages?.template),
      },
      extra:
        body?.extra?.map((item) =>
          createHttpExtraBodyRow(item.path, formatJsonishValue(item.value)),
        ) ?? [],
    },
    response: createResponseDraft(config.response),
    polling: createPollingDraft(config.polling, config.response),
  }
}

export function applyHttpPresetToDraft(
  draft: HttpConfigDraft,
  section: ImageProviderHttpSection,
  presetConfig: ImageProviderHttpConfig,
): HttpConfigDraft {
  if (section === "headers") {
    return {
      ...draft,
      headers: createHeaderRows(presetConfig.request.headers),
    }
  }

  if (section === "body") {
    const presetDraft = createHttpConfigDraft(presetConfig)

    return {
      ...draft,
      // 分段 preset 只替换请求体参数绑定，不改用户已经手动填写的 endpoint、方法或 Content-Type。
      body: presetDraft.body,
    }
  }

  return {
    ...draft,
    response: createResponseDraft(presetConfig.response),
  }
}

export function buildHttpConfigFromDraft(
  draft: HttpConfigDraft,
  deliveryMode: ImageProviderDeliveryMode,
): BuildHttpConfigDraftResult {
  const errors: string[] = []
  const requestUrl = draft.request.url.trim()
  const headers = buildHeaders(draft.headers, errors)
  const body = buildBodyConfig(draft.body, draft.request.contentType, errors)
  const response = buildResponseConfig(draft.response, errors)
  const polling = buildPollingConfig(draft.polling, deliveryMode, errors)

  if (!requestUrl) {
    errors.push("请求地址不能为空")
  }

  if (errors.length > 0) {
    return { errors }
  }

  // 这里才把页面表单草稿封装成后端保存的 httpConfig。
  // 后端运行时会继续根据 body 里的项目字段 path 注入提示词、比例、分辨率、数量和参考图。
  const config: ImageProviderHttpConfig = {
    request: {
      method: draft.request.method,
      url: requestUrl,
      contentType: draft.request.contentType,
      headers,
      body,
    },
    response,
  }

  if (polling) {
    config.polling = polling
  }

  return {
    config,
    errors: [],
  }
}

function createDraftId(prefix: string) {
  draftIdSeed += 1
  return `${prefix}-${draftIdSeed}`
}

function createHeaderRows(headers?: Record<string, string>) {
  const rows = Object.entries(headers ?? {}).map(([name, value]) =>
    createHttpHeaderRow(name, value),
  )

  return rows.length > 0 ? rows : [createHttpHeaderRow()]
}

function createOptionFieldDraft(
  field?: ImageProviderHttpBodyConfig["aspectRatio"],
): HttpOptionFieldDraft {
  return {
    path: field?.path ?? "",
    options:
      field?.options?.map((option) => {
        const labeledOption = getLabeledOption(option)

        if (labeledOption) {
          return createHttpOptionRow(
            labeledOption.label,
            formatJsonishValue(labeledOption.value ?? labeledOption.label),
          )
        }

        return createHttpOptionRow(
          formatJsonishValue(option),
          formatJsonishValue(option),
        )
      }) ?? [],
  }
}

function createResponseDraft(
  response: ImageProviderHttpResponse,
): HttpConfigDraft["response"] {
  return {
    imageType: response.images.type,
    dataPath: response.images.dataPath ?? "",
    urlPath: response.images.urlPath ?? "",
    mimeTypePath: response.images.mimeTypePath ?? "",
    mimeType: response.images.mimeType ?? "",
    totalTokensPath: response.usage?.totalTokensPath ?? "",
    inputTokensPath: response.usage?.inputTokensPath ?? "",
    outputTokensPath: response.usage?.outputTokensPath ?? "",
  }
}

function createPollingDraft(
  polling: ImageProviderHttpConfig["polling"],
  fallbackResponse: ImageProviderHttpResponse,
): HttpConfigDraft["polling"] {
  return {
    request: {
      method: polling?.request.method ?? "GET",
      url: polling?.request.url ?? "",
      contentType: polling?.request.contentType ?? "json",
    },
    headers: createHeaderRows(polling?.request.headers),
    taskIdPath: polling?.taskIdPath ?? "id",
    statusPath: polling?.statusPath ?? "status",
    successValue: polling?.successValue ?? "completed",
    failureValue: polling?.failureValue ?? "failed",
    intervalMs: numberToDraftText(polling?.intervalMs, 5000),
    timeoutMs: numberToDraftText(polling?.timeoutMs, 300000),
    useCustomResponse: Boolean(polling?.response),
    response: createResponseDraft(polling?.response ?? fallbackResponse),
  }
}

function buildHeaders(rows: HttpHeaderDraftRow[], errors: string[]) {
  return rows.reduce<Record<string, string>>((headers, row, index) => {
    const name = row.name.trim()
    const value = row.value.trim()

    if (!name && !value) {
      return headers
    }

    if (!name) {
      errors.push(`请求头第 ${index + 1} 行缺少字段名`)
      return headers
    }

    headers[name] = value
    return headers
  }, {})
}

function buildBodyConfig(
  draft: HttpConfigDraft["body"],
  contentType: ImageProviderHttpContentType,
  errors: string[],
): ImageProviderHttpBodyConfig {
  const body: ImageProviderHttpBodyConfig = {
    referenceImages: buildReferenceImagesConfig(
      draft.referenceImages,
      contentType,
      errors,
    ),
  }
  const promptPath = draft.promptPath.trim()

  if (!promptPath) {
    errors.push("提示词写入路径不能为空")
  } else {
    body.prompt = { path: promptPath }
  }

  body.aspectRatio = buildOptionFieldConfig(
    "尺寸比例",
    draft.aspectRatio,
    errors,
  )
  body.resolution = buildOptionFieldConfig("分辨率", draft.resolution, errors)
  body.quantity = buildQuantityConfig(draft.quantity, errors)
  body.extra = buildExtraBodyConfig(draft.extra, errors)

  return body
}

function buildOptionFieldConfig(
  label: string,
  draft: HttpOptionFieldDraft,
  errors: string[],
): ImageProviderHttpBodyConfig["aspectRatio"] {
  const path = draft.path.trim()
  const options = draft.options.flatMap((option, index) => {
    const optionLabel = option.label.trim()
    const valueText = option.valueText.trim()

    if (!optionLabel && !valueText) {
      return []
    }

    if (!optionLabel) {
      errors.push(`${label}第 ${index + 1} 个选项缺少展示名称`)
      return []
    }

    try {
      return [
        {
          label: optionLabel,
          value: parseJsonishValue(valueText || optionLabel, `${label}选项值`),
        },
      ]
    } catch (error) {
      errors.push(toParseErrorMessage(`${label}第 ${index + 1} 个选项值`, error))
      return []
    }
  })

  return {
    path,
    options,
  }
}

function buildQuantityConfig(
  draft: HttpConfigDraft["body"]["quantity"],
  errors: string[],
): ImageProviderHttpBodyConfig["quantity"] {
  const min = parseIntegerField(draft.min, "数量下限", 1, 16, errors) ?? 1
  const max = parseIntegerField(draft.max, "数量上限", 1, 16, errors) ?? 3
  const defaultValue =
    parseIntegerField(draft.defaultValue, "默认数量", 1, 16, errors) ?? 1

  if (max < min) {
    errors.push("数量上限不能小于下限")
  }

  if (defaultValue < min || defaultValue > max) {
    errors.push("默认数量必须位于数量上下限之间")
  }

  if (draft.enabled && !draft.path.trim()) {
    errors.push("启用数量参数时必须填写写入路径")
  }

  return {
    enabled: draft.enabled,
    path: draft.path.trim(),
    min,
    max,
    defaultValue,
  }
}

function buildReferenceImagesConfig(
  draft: HttpConfigDraft["body"]["referenceImages"],
  contentType: ImageProviderHttpContentType,
  errors: string[],
): NonNullable<ImageProviderHttpBodyConfig["referenceImages"]> {
  const mode = draft.mode
  const maxCount =
    parseIntegerField(draft.maxCount, "参考图上限", 0, 16, errors) ?? 16
  const config: NonNullable<ImageProviderHttpBodyConfig["referenceImages"]> = {
    mode,
    maxCount,
  }

  if (mode === "inlineBase64" || mode === "urlArray") {
    if (!draft.path.trim()) {
      errors.push("参考图写入路径不能为空")
    } else {
      config.path = draft.path.trim()
    }
  }

  if (mode === "inlineBase64") {
    try {
      config.template = parseJsonTemplate(draft.templateText, "参考图模板")
    } catch (error) {
      errors.push(toParseErrorMessage("参考图模板", error))
    }
  }

  if (mode === "multipart") {
    if (contentType !== "multipart") {
      errors.push("参考图 multipart 模式需要将 Content-Type 设为 multipart")
    }

    if (!draft.fieldName.trim()) {
      errors.push("参考图 multipart 模式需要填写文件字段名")
    } else {
      config.fieldName = draft.fieldName.trim()
    }
  }

  return config
}

function buildExtraBodyConfig(
  rows: HttpExtraBodyDraftRow[],
  errors: string[],
): ImageProviderHttpBodyConfig["extra"] {
  const extra = rows.flatMap((row, index) => {
    const path = row.path.trim()
    const valueText = row.valueText.trim()

    if (!path && !valueText) {
      return []
    }

    if (!path) {
      errors.push(`额外参数第 ${index + 1} 行缺少写入路径`)
      return []
    }

    try {
      return [
        {
          path,
          value: parseJsonishValue(valueText, `额外参数 ${path}`),
        },
      ]
    } catch (error) {
      errors.push(toParseErrorMessage(`额外参数第 ${index + 1} 行`, error))
      return []
    }
  })

  return extra.length > 0 ? extra : undefined
}

function buildResponseConfig(
  draft: HttpConfigDraft["response"],
  errors: string[],
): ImageProviderHttpResponse {
  const images: ImageProviderHttpResponse["images"] = {
    type: draft.imageType,
  }
  const dataPath = draft.dataPath.trim()
  const urlPath = draft.urlPath.trim()
  const mimeTypePath = draft.mimeTypePath.trim()
  const mimeType = draft.mimeType.trim()
  const totalTokensPath = draft.totalTokensPath.trim()
  const inputTokensPath = draft.inputTokensPath.trim()
  const outputTokensPath = draft.outputTokensPath.trim()

  if (draft.imageType === "url") {
    if (!urlPath) {
      errors.push("URL 图片返回路径不能为空")
    } else {
      images.urlPath = urlPath
    }
  } else if (!dataPath) {
    errors.push("图片数据返回路径不能为空")
  } else {
    images.dataPath = dataPath
  }

  if (mimeTypePath) {
    images.mimeTypePath = mimeTypePath
  }

  if (mimeType) {
    images.mimeType = mimeType
  }

  const usage = {
    ...(totalTokensPath ? { totalTokensPath } : {}),
    ...(inputTokensPath ? { inputTokensPath } : {}),
    ...(outputTokensPath ? { outputTokensPath } : {}),
  }

  return {
    images,
    ...(Object.keys(usage).length > 0 ? { usage } : {}),
  }
}

function buildPollingConfig(
  draft: HttpConfigDraft["polling"],
  deliveryMode: ImageProviderDeliveryMode,
  errors: string[],
): NonNullable<ImageProviderHttpConfig["polling"]> | undefined {
  if (deliveryMode !== "polling") {
    return undefined
  }

  const requestUrl = draft.request.url.trim()
  const taskIdPath = draft.taskIdPath.trim()
  const statusPath = draft.statusPath.trim()
  const successValue = draft.successValue.trim()
  const failureValue = draft.failureValue.trim()
  const intervalMs =
    parseIntegerField(draft.intervalMs, "轮询间隔", 1000, 60000, errors) ?? 5000
  const timeoutMs =
    parseIntegerField(draft.timeoutMs, "轮询超时", 10000, 600000, errors) ??
    300000

  if (!requestUrl) {
    errors.push("轮询请求地址不能为空")
  }

  if (!taskIdPath) {
    errors.push("轮询任务 ID 路径不能为空")
  }

  if (!statusPath) {
    errors.push("轮询状态路径不能为空")
  }

  if (!successValue) {
    errors.push("轮询成功状态值不能为空")
  }

  return {
    request: {
      method: draft.request.method,
      url: requestUrl,
      contentType: draft.request.contentType,
      headers: buildHeaders(draft.headers, errors),
    },
    taskIdPath,
    statusPath,
    successValue,
    ...(failureValue ? { failureValue } : {}),
    intervalMs,
    timeoutMs,
    ...(draft.useCustomResponse
      ? {
          response: buildResponseConfig(draft.response, errors),
        }
      : {}),
  }
}

function parseIntegerField(
  value: string,
  label: string,
  min: number,
  max: number,
  errors: string[],
) {
  const text = value.trim()

  if (!text) {
    return undefined
  }

  const parsed = Number(text)

  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    errors.push(`${label}必须是 ${min}-${max} 的整数`)
    return undefined
  }

  return parsed
}

function parseJsonishValue(valueText: string, label: string): JsonValue {
  const text = valueText.trim()

  if (!text) {
    return ""
  }

  if (shouldParseAsJson(text)) {
    try {
      const parsed = JSON.parse(text) as unknown

      if (isJsonValue(parsed)) {
        return parsed
      }

      throw new Error("不是合法 JSON 值")
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : `${label}不是合法 JSON 值`,
        { cause: error },
      )
    }
  }

  return text
}

function parseJsonTemplate(valueText: string, label: string): JsonValue {
  const text = valueText.trim()

  if (!text) {
    return {}
  }

  const parsed = JSON.parse(text) as unknown

  if (!isJsonValue(parsed)) {
    throw new Error(`${label}不是合法 JSON 值`)
  }

  return parsed
}

function shouldParseAsJson(value: string) {
  return (
    value.startsWith("{") ||
    value.startsWith("[") ||
    value.startsWith('"') ||
    value === "true" ||
    value === "false" ||
    value === "null" ||
    /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value)
  )
}

function formatJsonishValue(value: JsonValue | undefined) {
  if (value === undefined) {
    return ""
  }

  if (typeof value !== "string") {
    return JSON.stringify(value)
  }

  if (value === "" || shouldParseAsJson(value)) {
    return JSON.stringify(value)
  }

  return value
}

function formatJsonTemplate(value: JsonValue | undefined) {
  return value === undefined ? "" : JSON.stringify(value, null, 2)
}

function numberToDraftText(value: number | undefined, fallback: number) {
  return String(value ?? fallback)
}

function isHttpBodyConfig(
  value: ImageProviderHttpConfig["request"]["body"],
): value is ImageProviderHttpBodyConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false
  }

  return (
    "prompt" in value ||
    "aspectRatio" in value ||
    "resolution" in value ||
    "quantity" in value ||
    "referenceImages" in value ||
    "extra" in value
  )
}

function getLabeledOption(value: HttpBodyOptionSource) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }

  const label = "label" in value ? value.label : undefined

  if (typeof label !== "string") {
    return null
  }

  return {
    label,
    value: "value" in value ? value.value : undefined,
  }
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue)
  }

  if (typeof value === "object") {
    return Object.values(value).every(isJsonValue)
  }

  return false
}

function toParseErrorMessage(label: string, error: unknown) {
  return error instanceof Error
    ? `${label}格式不正确：${error.message}`
    : `${label}格式不正确`
}
