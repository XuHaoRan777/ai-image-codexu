import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import type {
  AspectRatio,
  ImageProviderDeliveryMode,
  ImageProviderFieldMapping,
  ImageProviderFieldOverrides,
  ImageProviderHttpBinding,
  ImageProviderHttpBodyConfig,
  ImageProviderHttpBodyField,
  ImageProviderHttpBodyOption,
  ImageProviderHttpConfig,
  ImageProviderHttpQuantityField,
  ImageProviderHttpReferenceImages,
  ImageProviderHttpRequest,
  ImageProviderHttpResponse,
  ImageProviderPollingConfig,
  ImageProviderType,
  ImageQuantity,
  ImageResolution,
  JsonValue,
} from '@ai-image-codexu/shared';
import { ImageProviderTypeEnum } from '@ai-image-codexu/shared';
import axios, { AxiosError } from 'axios';

export type ImageProviderRequest = {
  providerType: ImageProviderType;
  deliveryMode: ImageProviderDeliveryMode;
  apiKey: string;
  baseUrl: string;
  generationPath?: string;
  editPath?: string;
  // Google 模式模型名已包含在完整请求地址(baseUrl)里,故此处可选
  modelName?: string;
  prompt: string;
  aspectRatio: AspectRatio;
  resolution: ImageResolution;
  quantity: ImageQuantity;
  referenceImages?: string[];
  fieldMapping?: ImageProviderFieldMapping;
  fieldOverrides?: ImageProviderFieldOverrides;
  pollingConfig?: ImageProviderPollingConfig;
};

export type ConfiguredHttpImageProviderRequest = {
  deliveryMode: ImageProviderDeliveryMode;
  apiKey: string;
  httpConfig: ImageProviderHttpConfig;
  prompt: string;
  aspectRatio: AspectRatio;
  resolution: ImageResolution;
  quantity: ImageQuantity;
  referenceImages?: string[];
};

const providerLogger = new Logger('ImageProviderDispatcher');
const defaultProviderTimeoutMs = 300_000;
const defaultOpenAiGenerationPath = '/v1/images/generations';
const defaultOpenAiEditPath = '/v1/images/edits';
const defaultPollingIntervalMs = 5_000;
const defaultPollingTimeoutMs = 300_000;

export type GeneratedImage = {
  content: Buffer;
  mimeType: string;
};

export type ImageProviderResult = {
  images: GeneratedImage[];
  tokenUsage?: number;
  inputTokenUsage?: number;
  outputTokenUsage?: number;
};

type OpenAiExtractedImage = GeneratedImage | string;

type OpenAiImageResponse = {
  data?: Array<{
    b64_json?: string;
    url?: string;
  }>;
};

type GeminiImageResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        inlineData?: {
          mimeType?: string;
          data?: string;
        };
      }>;
    };
  }>;
};

@Injectable()
export class ImageProviderDispatcher {
  /**
   * 根据协议类型和交付方式生成图片。
   */
  async generate(request: ImageProviderRequest) {
    switch (request.providerType) {
      case ImageProviderTypeEnum.OpenAICompatible:
        return this.generateOpenAiCompatible(request);
      case ImageProviderTypeEnum.GoogleCompatible:
        return this.generateGoogleCompatible(request);
    }
  }

  async generateConfiguredHttp(
    request: ConfiguredHttpImageProviderRequest,
  ): Promise<ImageProviderResult> {
    const createRequest = buildConfiguredHttpRequest(
      request.httpConfig.request,
      getBusinessPlaceholderContext(request),
    );
    const requestBody = buildConfiguredHttpBody(request);
    const createResponse = await executeConfiguredHttpRequest(
      createRequest,
      requestBody.data,
      requestBody.logBody,
    );

    if (request.deliveryMode !== 'polling') {
      return extractConfiguredHttpResult(
        createResponse,
        request.httpConfig.response,
      );
    }

    const polling = request.httpConfig.polling;

    if (!polling) {
      throw new BadGatewayException('Polling config is required');
    }

    const pollResponse = await pollConfiguredHttpTask(createResponse, request);

    return extractConfiguredHttpResult(
      pollResponse,
      polling.response ?? request.httpConfig.response,
    );
  }

  /**
   * 组装 OpenAI Images 兼容请求，并支持同步响应或任务轮询响应。
   */
  private async generateOpenAiCompatible(request: ImageProviderRequest) {
    const response = request.referenceImages?.length
      ? await this.createOpenAiEdit(request)
      : await this.createOpenAiGeneration(request);

    if (request.deliveryMode === 'polling') {
      const imageUrls = await pollProviderTask(response, request);
      return this.extractOpenAiLikeImages({
        data: imageUrls.map((url) => ({ url })),
      });
    }

    return this.extractOpenAiLikeImages(response as OpenAiImageResponse);
  }

  /**
   * 组装 OpenAI-compatible 文生图 JSON 请求。
   */
  private createOpenAiGeneration(request: ImageProviderRequest) {
    const body = buildMappedBody(request, {
      // OpenAI 模式的 modelName 必填由 shared schema 保证,此处兜底消除可选类型报错
      model: request.modelName ?? '',
      prompt: request.prompt,
      quantity: request.quantity,
      size: toOpenAiSize(request.aspectRatio, request.resolution),
      quality: toOpenAiQuality(request.resolution),
      responseFormat: 'b64_json',
    });
    const url = joinUrl(
      request.baseUrl,
      request.generationPath || defaultOpenAiGenerationPath,
    );

    logProviderRequest('json', url, body);

    return postWithProviderError<unknown>(url, body, {
      Authorization: `Bearer ${request.apiKey}`,
      'Content-Type': 'application/json',
    });
  }

  /**
   * 组装 OpenAI-compatible 图生图 multipart 请求。
   */
  private createOpenAiEdit(request: ImageProviderRequest) {
    const form = new FormData();
    const logBody: Record<string, unknown> = {};
    const fields = buildMappedBody(request, {
      // OpenAI 模式的 modelName 必填由 shared schema 保证,此处兜底消除可选类型报错
      model: request.modelName ?? '',
      prompt: request.prompt,
      quantity: request.quantity,
      size: toOpenAiSize(request.aspectRatio, request.resolution),
      quality: toOpenAiQuality(request.resolution),
      responseFormat: 'b64_json',
    });

    Object.entries(fields).forEach(([key, value]) => {
      form.set(key, String(value));
      logBody[key] = value;
    });

    if (isFieldEnabled(request.fieldOverrides, 'image')) {
      const imageFieldName = mapFieldName(request.fieldMapping, 'image');
      const imageLogs: string[] = [];

      request.referenceImages?.forEach((image, index) => {
        const parsed = parseDataUrl(image);
        form.append(
          imageFieldName,
          new Blob([parsed.content], { type: parsed.mimeType }),
          `reference-${index + 1}.${mimeTypeToExtension(parsed.mimeType)}`,
        );
        imageLogs.push(truncateImageLogValue(image));
      });

      if (imageLogs.length > 0) {
        logBody[imageFieldName] = imageLogs;
      }
    }

    const url = joinUrl(
      request.baseUrl,
      request.editPath || defaultOpenAiEditPath,
    );

    logProviderRequest('multipart/form-data', url, logBody);

    return postWithProviderError<unknown>(url, form, {
      Authorization: `Bearer ${request.apiKey}`,
    });
  }

  /**
   * 组装 Google Gemini-compatible generateContent 请求。
   */
  private async generateGoogleCompatible(request: ImageProviderRequest) {
    const parts: Array<Record<string, unknown>> = [{ text: request.prompt }];

    request.referenceImages?.forEach((image) => {
      const parsed = parseDataUrl(image);
      parts.push({
        inlineData: {
          mimeType: parsed.mimeType,
          data: parsed.content.toString('base64'),
        },
      });
    });

    const generationConfig: Record<string, unknown> = {
      responseModalities: ['TEXT', 'IMAGE'],
    };

    if (isFieldEnabled(request.fieldOverrides, 'quantity')) {
      generationConfig.candidateCount = request.quantity;
    }
    if (isFieldEnabled(request.fieldOverrides, 'size')) {
      generationConfig.imageConfig = buildGeminiImageConfig(request);
    }
    // Google 模式的 baseUrl 已是含模型名与 :generateContent 的完整端点,直接使用,不再拼接
    const url = request.baseUrl;
    const body = {
      contents: [{ parts }],
      generationConfig,
    };

    logProviderRequest('json', url, truncateGoogleImageBody(body));

    const response = await postWithProviderError<GeminiImageResponse>(
      url,
      body,
      {
        'Content-Type': 'application/json',
        'x-goog-api-key': request.apiKey,
      },
    );

    const images =
      response.candidates
        ?.flatMap((candidate) => candidate.content?.parts ?? [])
        .flatMap((part) =>
          part.inlineData?.data
            ? [
                {
                  content: Buffer.from(part.inlineData.data, 'base64'),
                  mimeType: part.inlineData.mimeType ?? 'image/png',
                },
              ]
            : [],
        ) ?? [];

    if (images.length === 0) {
      throw new BadGatewayException('Google 生图接口未返回图片数据');
    }

    return images;
  }

  /**
   * 从 OpenAI Images 兼容响应中提取 base64 图片或下载远程图片 URL。
   */
  private extractOpenAiLikeImages(response: OpenAiImageResponse) {
    const images: OpenAiExtractedImage[] = [];

    response.data?.forEach((item) => {
      if (item.b64_json) {
        images.push({
          content: Buffer.from(item.b64_json, 'base64'),
          mimeType: 'image/png',
        });
        return;
      }

      if (item.url) {
        images.push(item.url);
      }
    });

    if (images.length === 0) {
      throw new BadGatewayException('生图接口未返回图片数据');
    }

    return Promise.all(images.map(downloadRemoteImage));
  }
}

type ConfiguredHttpBuiltRequest = {
  method: 'GET' | 'POST';
  url: string;
  contentType: ImageProviderHttpRequest['contentType'];
  headers: Record<string, string>;
};

type PlaceholderContext = Record<string, string | number | boolean | undefined>;

function buildConfiguredHttpRequest(
  config: ImageProviderHttpRequest,
  context: PlaceholderContext,
): ConfiguredHttpBuiltRequest {
  return {
    method: config.method ?? 'POST',
    url: renderTemplate(config.url, context),
    contentType: config.contentType ?? 'json',
    headers: Object.fromEntries(
      Object.entries(config.headers ?? {}).map(([key, value]) => [
        key,
        renderTemplate(value, context),
      ]),
    ),
  };
}

function buildConfiguredHttpBody(request: ConfiguredHttpImageProviderRequest) {
  const bodyConfig = request.httpConfig.request.body;

  if (isConfiguredHttpBodyConfig(bodyConfig)) {
    return buildConfiguredHttpBodyFromParamConfig(request, bodyConfig);
  }

  return buildLegacyConfiguredHttpBody(request);
}

function buildConfiguredHttpBodyFromParamConfig(
  request: ConfiguredHttpImageProviderRequest,
  bodyConfig: ImageProviderHttpBodyConfig,
) {
  const context = getBusinessPlaceholderContext(request);
  const body: Record<string, JsonValue> = {};
  const referenceImagesConfig =
    bodyConfig.referenceImages ?? request.httpConfig.referenceImages;

  // request.body 在新模型里不是最终请求体，而是“项目字段 -> 第三方 path/value”的参数配置。
  // 这里从空对象开始，把 extra 固定参数和页面业务参数写入对应 path 后，才得到真实发送 body。
  applyConfiguredExtraBodyParams(body, bodyConfig, context);
  applyConfiguredStandardBodyParams(body, bodyConfig, request, context);

  if (request.httpConfig.request.contentType === 'multipart') {
    return buildMultipartBody(body, request, referenceImagesConfig);
  }

  applyJsonReferenceImages(body, request, referenceImagesConfig);

  return {
    data: body,
    logBody: body,
  };
}

function buildLegacyConfiguredHttpBody(
  request: ConfiguredHttpImageProviderRequest,
) {
  const context = getBusinessPlaceholderContext(request);
  // 旧配置兼容：request.body 是配置页维护的静态模板；这里先深拷贝并替换 {{prompt}} 等占位符，
  // 后续再按 bindings 把页面业务参数写入指定路径，避免直接修改数据库里的模板对象。
  const body = renderJsonValueTemplates(
    cloneJsonValue(request.httpConfig.request.body ?? {}),
    context,
  );

  // 示例：Google 模板里的 contents[0].parts[0].text 初始为空，
  // bindings.prompt 会在这里把真实提示词写进去。
  applyBusinessBindings(body, request);

  if (request.httpConfig.request.contentType === 'multipart') {
    return buildMultipartBody(body, request, request.httpConfig.referenceImages);
  }

  // JSON 请求的参考图需要在普通业务参数写完后追加，
  // 这样 contents[0].parts[] 这类路径可以继续在已有数组后 push 图片块。
  applyJsonReferenceImages(body, request, request.httpConfig.referenceImages);

  return {
    data: body,
    logBody: body,
  };
}

function isConfiguredHttpBodyConfig(
  value: unknown,
): value is ImageProviderHttpBodyConfig {
  if (!isJsonRecord(value)) {
    return false;
  }

  return (
    isConfiguredBodyField(value.prompt) ||
    isConfiguredBodyField(value.aspectRatio) ||
    isConfiguredBodyField(value.resolution) ||
    isConfiguredQuantityField(value.quantity) ||
    isConfiguredReferenceImagesField(value.referenceImages) ||
    Array.isArray(value.extra)
  );
}

function isConfiguredBodyField(value: unknown) {
  return (
    isJsonRecord(value) &&
    ('path' in value ||
      'options' in value ||
      'enabled' in value ||
      'defaultValue' in value)
  );
}

function isConfiguredQuantityField(value: unknown) {
  return (
    isJsonRecord(value) &&
    ('path' in value ||
      'enabled' in value ||
      'min' in value ||
      'max' in value ||
      'defaultValue' in value)
  );
}

function isConfiguredReferenceImagesField(value: unknown) {
  return (
    isJsonRecord(value) &&
    ('mode' in value ||
      'path' in value ||
      'fieldName' in value ||
      'template' in value ||
      'maxCount' in value)
  );
}

function getBusinessPlaceholderContext(
  request: ConfiguredHttpImageProviderRequest,
): PlaceholderContext {
  return {
    apiKey: request.apiKey,
    prompt: request.prompt,
    aspectRatio: request.aspectRatio,
    resolution: request.resolution,
    quantity: request.quantity,
  };
}

function applyConfiguredExtraBodyParams(
  body: JsonValue,
  bodyConfig: ImageProviderHttpBodyConfig,
  context: PlaceholderContext,
) {
  (bodyConfig.extra ?? []).forEach((entry) => {
    // extra 是第三方接口私有的固定参数；用户手动控制 path/value，
    // 后端只负责模板占位符替换和按 path 写入最终请求体。
    const value = renderJsonValueTemplates(cloneJsonValue(entry.value), context);

    writeValueByPath(body, entry.path, value);
  });
}

function applyConfiguredStandardBodyParams(
  body: JsonValue,
  bodyConfig: ImageProviderHttpBodyConfig,
  request: ConfiguredHttpImageProviderRequest,
  context: PlaceholderContext,
) {
  applyConfiguredBodyField(body, bodyConfig.prompt, request.prompt, context);
  applyConfiguredBodyField(
    body,
    bodyConfig.aspectRatio,
    request.aspectRatio,
    context,
  );
  applyConfiguredBodyField(
    body,
    bodyConfig.resolution,
    request.resolution,
    context,
  );
  applyConfiguredQuantityField(body, bodyConfig.quantity, request);
}

function applyConfiguredBodyField(
  body: JsonValue,
  field: ImageProviderHttpBodyField | undefined,
  rawValue: string,
  context: PlaceholderContext,
) {
  if (!field || field.enabled === false || !field.path) {
    return;
  }

  const value = resolveConfiguredOptionValue(field, rawValue, context);

  // `value: null` 表示该选项不写入第三方请求体，例如某些 Google 接口的 auto。
  if (value === undefined || value === null) {
    return;
  }

  writeValueByPath(body, field.path, value);
}

function applyConfiguredQuantityField(
  body: JsonValue,
  field: ImageProviderHttpQuantityField | undefined,
  request: ConfiguredHttpImageProviderRequest,
) {
  if (!field || field.enabled === false || !field.path) {
    return;
  }

  const value = Number.isFinite(request.quantity)
    ? request.quantity
    : field.defaultValue;

  if (value === undefined) {
    return;
  }

  writeValueByPath(body, field.path, value);
}

function resolveConfiguredOptionValue(
  field: ImageProviderHttpBodyField,
  rawValue: string,
  context: PlaceholderContext,
): JsonValue | undefined {
  const matchedOption = field.options?.find((option) =>
    isConfiguredOptionMatch(option, rawValue),
  );
  const value =
    matchedOption === undefined
      ? rawValue
      : getConfiguredOptionRequestValue(matchedOption, rawValue);

  if (value === undefined) {
    return undefined;
  }

  return renderJsonValueTemplates(cloneJsonValue(value), context);
}

function isConfiguredOptionMatch(
  option: ImageProviderHttpBodyOption,
  rawValue: string,
) {
  if (isConfiguredOptionObject(option)) {
    return (
      option.label === rawValue ||
      stringifyComparableJson(option.value) === rawValue
    );
  }

  return stringifyComparableJson(option) === rawValue;
}

function getConfiguredOptionRequestValue(
  option: ImageProviderHttpBodyOption,
  rawValue: string,
): JsonValue | undefined {
  if (isConfiguredOptionObject(option)) {
    return option.value === undefined ? option.label : option.value;
  }

  return option === undefined ? rawValue : option;
}

function isConfiguredOptionObject(
  value: ImageProviderHttpBodyOption,
): value is { label: string; value?: JsonValue } {
  return isJsonRecord(value) && typeof value.label === 'string';
}

function stringifyComparableJson(value: JsonValue | undefined) {
  if (value === undefined) {
    return '';
  }

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null
  ) {
    return String(value);
  }

  return JSON.stringify(value);
}

function applyBusinessBindings(
  body: JsonValue,
  request: ConfiguredHttpImageProviderRequest,
) {
  const bindingEntries = Object.entries(
    request.httpConfig.bindings ?? {},
  ) as Array<
    [
      keyof NonNullable<ImageProviderHttpConfig['bindings']>,
      ImageProviderHttpBinding | undefined,
    ]
  >;

  bindingEntries.forEach(([key, binding]) => {
    if (!binding || binding.enabled === false || !binding.path) {
      return;
    }

    // rawValue 来自生图页面的稳定业务参数；第三方字段名和层级差异只由 binding.path 表达。
    const rawValue = {
      prompt: request.prompt,
      aspectRatio: request.aspectRatio,
      resolution: request.resolution,
      quantity: request.quantity,
    }[key];
    const value = normalizeBindingValue(rawValue, binding);

    if (value === undefined) {
      return;
    }

    writeValueByPath(body, binding.path, value);
  });
}

function normalizeBindingValue(
  value: string | number,
  binding: ImageProviderHttpBinding,
) {
  if (
    binding.omitWhen !== undefined &&
    JSON.stringify(binding.omitWhen) === JSON.stringify(value)
  ) {
    return binding.defaultValue;
  }

  const mapped = binding.map?.[String(value)];

  if (mapped !== undefined) {
    return mapped;
  }

  return value;
}

function applyJsonReferenceImages(
  body: JsonValue,
  request: ConfiguredHttpImageProviderRequest,
  config: ImageProviderHttpReferenceImages,
) {
  const referenceImages = request.referenceImages ?? [];

  if (referenceImages.length === 0) {
    return;
  }

  const mode = config?.mode ?? 'none';
  assertReferenceImageCount(referenceImages, config);

  if (mode === 'none') {
    throw new BadGatewayException('Reference images are not supported');
  }

  if (mode === 'multipart') {
    throw new BadGatewayException(
      'Reference image mode must be inlineBase64 for JSON requests',
    );
  }

  if (mode === 'urlArray') {
    throw new BadGatewayException(
      'Reference image URL mode requires OSS support',
    );
  }

  if (!config?.path) {
    throw new BadGatewayException('Reference image path is required');
  }

  const values = referenceImages.map((image) => {
    const parsed = parseDataUrl(image);
    // inlineBase64 模式把前端 data URL 拆成 mimeType + 纯 base64，
    // 再套入配置里的 template，例如 Google 的 inlineData 结构。
    return renderJsonValueTemplates(config.template ?? '{{base64}}', {
      ...getBusinessPlaceholderContext(request),
      dataUrl: image,
      mimeType: parsed.mimeType,
      base64: parsed.content.toString('base64'),
    });
  });

  if (config.path.endsWith('[]')) {
    values.forEach((value) => writeValueByPath(body, config.path!, value));
    return;
  }

  writeValueByPath(body, config.path, values.length === 1 ? values[0] : values);
}

function buildMultipartBody(
  body: JsonValue,
  request: ConfiguredHttpImageProviderRequest,
  referenceImagesConfig: ImageProviderHttpReferenceImages,
) {
  const form = new FormData();
  const logBody: Record<string, unknown> = {};

  appendBodyFieldsToForm(form, logBody, body);
  appendMultipartReferenceImages(form, logBody, request, referenceImagesConfig);

  return {
    data: form,
    logBody,
  };
}

function appendBodyFieldsToForm(
  form: FormData,
  logBody: Record<string, unknown>,
  body: JsonValue,
) {
  if (!isJsonRecord(body)) {
    form.set('body', JSON.stringify(body));
    logBody.body = body;
    return;
  }

  Object.entries(body).forEach(([key, value]) => {
    const formValue = typeof value === 'string' ? value : JSON.stringify(value);
    form.set(key, formValue);
    logBody[key] = value;
  });
}

function appendMultipartReferenceImages(
  form: FormData,
  logBody: Record<string, unknown>,
  request: ConfiguredHttpImageProviderRequest,
  config: ImageProviderHttpReferenceImages,
) {
  const referenceImages = request.referenceImages ?? [];

  if (referenceImages.length === 0) {
    return;
  }

  const mode = config?.mode ?? 'none';
  assertReferenceImageCount(referenceImages, config);

  if (mode !== 'multipart') {
    throw new BadGatewayException('Reference image mode must be multipart');
  }

  const fieldName = config?.fieldName || 'image';
  const imageLogs: string[] = [];

  referenceImages.forEach((image, index) => {
    const parsed = parseDataUrl(image);
    form.append(
      fieldName,
      new Blob([parsed.content], { type: parsed.mimeType }),
      `reference-${index + 1}.${mimeTypeToExtension(parsed.mimeType)}`,
    );
    imageLogs.push(truncateImageLogValue(image));
  });

  logBody[fieldName] = imageLogs;
}

function assertReferenceImageCount(
  referenceImages: string[],
  config: ImageProviderHttpReferenceImages,
) {
  const maxCount = config?.maxCount ?? 16;

  if (referenceImages.length > maxCount) {
    throw new BadGatewayException(`最多支持 ${maxCount} 张参考图`);
  }
}

async function executeConfiguredHttpRequest(
  request: ConfiguredHttpBuiltRequest,
  data: unknown,
  logBody: unknown,
) {
  logConfiguredProviderRequest(request, logBody);

  if (request.method === 'GET') {
    return getWithProviderError<unknown>(request.url, request.headers);
  }

  return postWithProviderError<unknown>(request.url, data, request.headers);
}

async function pollConfiguredHttpTask(
  createResponse: unknown,
  request: ConfiguredHttpImageProviderRequest,
) {
  const polling = request.httpConfig.polling;

  if (!polling) {
    throw new BadGatewayException('Polling config is required');
  }

  const taskId = getStringByPath(createResponse, polling.taskIdPath);

  if (!taskId) {
    throw new BadGatewayException('Image provider did not return task ID');
  }

  const intervalMs = polling.intervalMs ?? defaultPollingIntervalMs;
  const timeoutMs = polling.timeoutMs ?? defaultPollingTimeoutMs;
  const startedAt = Date.now();

  while (Date.now() - startedAt <= timeoutMs) {
    const context = {
      ...getBusinessPlaceholderContext(request),
      taskId,
    };
    const pollRequest = buildConfiguredHttpRequest(polling.request, context);
    const pollBody = renderJsonValueTemplates(
      cloneJsonValue(polling.request.body ?? {}),
      context,
    );
    const task = await executeConfiguredHttpRequest(
      pollRequest,
      pollBody,
      pollBody,
    );
    const status = getStringByPath(task, polling.statusPath);

    if (status === polling.successValue) {
      return task;
    }

    if (polling.failureValue && status === polling.failureValue) {
      logProviderResponsePayload(task);
      throw new BadGatewayException(
        extractProviderErrorMessage(task) ?? 'Image provider task failed',
      );
    }

    await delay(intervalMs);
  }

  throw new BadGatewayException('Image provider polling timed out');
}

async function extractConfiguredHttpResult(
  payload: unknown,
  responseConfig: ImageProviderHttpResponse,
): Promise<ImageProviderResult> {
  const images = await extractConfiguredImages(payload, responseConfig);
  const tokenUsage = extractConfiguredTokenUsage(payload, responseConfig);

  return {
    images,
    ...tokenUsage,
  };
}

async function extractConfiguredImages(
  payload: unknown,
  responseConfig: ImageProviderHttpResponse,
) {
  const imageConfig = responseConfig.images;
  const dataPath = imageConfig.dataPath;
  const urlPath = imageConfig.urlPath ?? dataPath;

  if (imageConfig.type === 'url') {
    if (!urlPath) {
      throw new BadGatewayException('Image URL path is required');
    }

    const urls = getStringArrayByPath(payload, urlPath);

    if (urls.length === 0) {
      throw new BadGatewayException('Image provider did not return image URL');
    }

    return Promise.all(urls.map(downloadRemoteImage));
  }

  if (!dataPath) {
    throw new BadGatewayException('Image data path is required');
  }

  const values = getStringArrayByPath(payload, dataPath);
  const mimeTypes = imageConfig.mimeTypePath
    ? getStringArrayByPath(payload, imageConfig.mimeTypePath)
    : [];

  if (values.length === 0) {
    throw new BadGatewayException('Image provider did not return image data');
  }

  if (imageConfig.type === 'dataUrl') {
    return values.map((value) => {
      const parsed = parseDataUrl(value);

      return {
        content: parsed.content,
        mimeType: parsed.mimeType,
      };
    });
  }

  return values.map((value, index) => {
    if (value.startsWith('data:')) {
      const parsed = parseDataUrl(value);

      return {
        content: parsed.content,
        mimeType: parsed.mimeType,
      };
    }

    return {
      content: Buffer.from(value, 'base64'),
      mimeType: mimeTypes[index] ?? imageConfig.mimeType ?? 'image/png',
    };
  });
}

function extractConfiguredTokenUsage(
  payload: unknown,
  responseConfig: ImageProviderHttpResponse,
) {
  const usage = responseConfig.usage;
  const tokenUsage = extractIntegerByPath(payload, usage?.totalTokensPath);
  const inputTokenUsage = extractIntegerByPath(
    payload,
    usage?.inputTokensPath,
  );
  const outputTokenUsage = extractIntegerByPath(
    payload,
    usage?.outputTokensPath,
  );
  const computedTokenUsage =
    tokenUsage ??
    (inputTokenUsage !== undefined && outputTokenUsage !== undefined
      ? inputTokenUsage + outputTokenUsage
      : undefined);

  return {
    tokenUsage: computedTokenUsage,
    inputTokenUsage,
    outputTokenUsage,
  };
}

function extractIntegerByPath(payload: unknown, path?: string) {
  if (!path) {
    return undefined;
  }

  const value = getValuesByPath(payload, path)[0];

  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);

    return Number.isFinite(parsed) ? Math.max(0, parsed) : undefined;
  }

  return undefined;
}

function cloneJsonValue<T extends JsonValue | undefined>(value: T): T {
  if (value === undefined) {
    return value;
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

function renderJsonValueTemplates<T extends JsonValue>(
  value: T,
  context: PlaceholderContext,
): T {
  if (typeof value === 'string') {
    return renderTemplate(value, context) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => renderJsonValueTemplates(item, context)) as T;
  }

  if (isJsonRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        renderJsonValueTemplates(item, context),
      ]),
    ) as T;
  }

  return value;
}

function renderTemplate(value: string, context: PlaceholderContext) {
  return value.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    const nextValue = context[key];

    return nextValue === undefined ? '' : String(nextValue);
  });
}

function isJsonRecord(value: unknown): value is Record<string, JsonValue> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

type StandardOpenAiFields = {
  model: string;
  prompt: string;
  quantity: number;
  size: string;
  quality: string;
  responseFormat: string;
};

/**
 * 按字段映射和启用规则构造 OpenAI-compatible 请求体。
 */
function buildMappedBody(
  request: Pick<ImageProviderRequest, 'fieldMapping' | 'fieldOverrides'>,
  fields: StandardOpenAiFields,
) {
  const body: Record<string, string | number> = {};
  const entries = [
    ['model', fields.model],
    ['prompt', fields.prompt],
    ['quantity', fields.quantity],
    ['size', fields.size],
    ['quality', fields.quality],
    ['responseFormat', fields.responseFormat],
  ] as const;

  entries.forEach(([field, value]) => {
    if (!isFieldEnabled(request.fieldOverrides, field)) {
      return;
    }

    body[mapFieldName(request.fieldMapping, field)] = value;
  });

  return body;
}

/**
 * 构造 Gemini 图像配置，auto 尺寸时不发送固定 aspectRatio。
 */
function buildGeminiImageConfig(request: ImageProviderRequest) {
  const imageConfig: Record<string, string> = {};

  if (request.aspectRatio !== 'auto') {
    imageConfig.aspectRatio = request.aspectRatio;
  }

  if (isFieldEnabled(request.fieldOverrides, 'resolution')) {
    imageConfig.imageSize = toGeminiImageSize(request.resolution);
  }

  return imageConfig;
}

/**
 * 轮询第三方异步任务并提取结果 URL。
 */
async function pollProviderTask(
  createResponse: unknown,
  request: ImageProviderRequest,
) {
  const config = request.pollingConfig ?? {};
  const taskId = getStringByPath(createResponse, config.taskIdPath || 'id');

  if (!taskId) {
    throw new BadGatewayException('生图接口未返回任务 ID');
  }

  const pollPathTemplate = config.pollPathTemplate || '/v1/tasks/{taskId}';
  const intervalMs = config.intervalMs ?? defaultPollingIntervalMs;
  const timeoutMs = config.timeoutMs ?? defaultPollingTimeoutMs;
  const statusPath = config.statusPath || 'status';
  const successStatusValue = config.successStatusValue || 'completed';
  const failureStatusValue = config.failureStatusValue || 'failed';
  const resultUrlsPath = config.resultUrlsPath || 'result_data[].url';
  const startedAt = Date.now();

  while (Date.now() - startedAt <= timeoutMs) {
    const task = await getWithProviderError<unknown>(
      joinUrl(
        request.baseUrl,
        pollPathTemplate.replaceAll('{taskId}', encodeURIComponent(taskId)),
      ),
      {
        Authorization: `Bearer ${request.apiKey}`,
      },
    );
    const status = getStringByPath(task, statusPath);

    if (status === successStatusValue) {
      const urls = getStringArrayByPath(task, resultUrlsPath);

      if (urls.length === 0) {
        throw new BadGatewayException('生图任务未返回图片 URL');
      }

      return urls;
    }

    if (status === failureStatusValue) {
      logProviderResponsePayload(task);
      throw new BadGatewayException(
        extractProviderErrorMessage(task) ?? '生图任务失败',
      );
    }

    await delay(intervalMs);
  }

  throw new BadGatewayException('生图任务轮询超时');
}

/**
 * 发起 provider POST 请求，并将第三方错误转换为后端网关错误。
 */
async function postWithProviderError<T>(
  url: string,
  data: unknown,
  headers: Record<string, string>,
) {
  try {
    const response = await axios.post<T>(url, data, {
      headers,
      timeout: defaultProviderTimeoutMs,
    });

    return response.data;
  } catch (error) {
    if (error instanceof AxiosError) {
      throw toProviderGatewayException(error);
    }

    throw error;
  }
}

/**
 * 发起 provider GET 请求，并复用第三方错误格式化逻辑。
 */
async function getWithProviderError<T>(
  url: string,
  headers: Record<string, string>,
) {
  try {
    const response = await axios.get<T>(url, {
      headers,
      timeout: defaultProviderTimeoutMs,
    });

    return response.data;
  } catch (error) {
    if (error instanceof AxiosError) {
      throw toProviderGatewayException(error);
    }

    throw error;
  }
}

/**
 * 下载远程图片 URL 并转换为本地可保存的二进制结构。
 */
async function downloadRemoteImage(image: OpenAiExtractedImage) {
  if (typeof image !== 'string') {
    return image;
  }

  const response = await axios.get<ArrayBuffer>(image, {
    responseType: 'arraybuffer',
  });

  return {
    content: Buffer.from(response.data),
    mimeType: String(response.headers['content-type'] ?? 'image/png'),
  };
}

/**
 * 将 axios provider 错误转换为后端网关错误，并输出格式化后的第三方响应摘要。
 */
function toProviderGatewayException(error: AxiosError) {
  const message =
    extractProviderErrorMessage(error.response?.data) ||
    error.message ||
    '外部生图接口请求失败';
  logProviderResponsePayload(error.response?.data, error.response?.status);

  return new BadGatewayException(message);
}

/**
 * 打印已经完成字段映射和请求体封装后的 provider 请求参数。
 */
function logProviderRequest(
  contentType: string,
  url: string,
  body: Record<string, unknown>,
) {
  providerLogger.log(
    '\n' +
      JSON.stringify(
        {
          message: 'Provider image request',
          contentType,
          url,
          body,
        },
        null,
        2,
      ),
  );
}

function logConfiguredProviderRequest(
  request: ConfiguredHttpBuiltRequest,
  body: unknown,
) {
  providerLogger.log(
    '\n' +
      JSON.stringify(
        {
          message: 'Provider image request',
          method: request.method,
          contentType: request.contentType,
          url: redactProviderUrl(request.url),
          headers: redactProviderHeaders(request.headers),
          body: toProviderRequestLogPayload(body),
        },
        null,
        2,
      ),
  );
}

/**
 * 仅打印第三方接口返回摘要，避免混入任务上下文或敏感请求内容。
 */
function logProviderResponsePayload(payload: unknown, status?: number) {
  providerLogger.error(
    JSON.stringify(
      {
        message: 'Provider image response',
        status,
        response: toProviderLogPayload(payload),
      },
      null,
      2,
    ),
  );
}

/**
 * 将第三方响应体转换为可读、可脱敏的日志结构。
 */
function toProviderLogPayload(payload: unknown) {
  if (payload === undefined || payload === null) {
    return undefined;
  }

  if (typeof payload === 'string') {
    const parsed = parseJsonPayload(payload);

    return parsed === undefined
      ? truncateProviderText(payload)
      : toProviderLogPayload(parsed);
  }

  if (typeof payload === 'object') {
    try {
      return JSON.parse(JSON.stringify(payload, redactSensitivePayload));
    } catch {
      return '[unserializable provider payload]';
    }
  }

  return payload;
}

function toProviderRequestLogPayload(payload: unknown) {
  if (payload === undefined || payload === null) {
    return payload;
  }

  if (typeof payload === 'object') {
    try {
      return JSON.parse(JSON.stringify(payload, redactRequestPayload));
    } catch {
      return '[unserializable provider request]';
    }
  }

  if (typeof payload === 'string') {
    return redactRequestPayload('', payload);
  }

  return payload;
}

function redactRequestPayload(key: string, value: unknown) {
  if (isSensitiveKey(key)) {
    return '[redacted]';
  }

  if (typeof value === 'string' && isImagePayloadString(value)) {
    return truncateImageLogValue(value);
  }

  return value;
}

function redactProviderHeaders(headers: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key,
      isSensitiveKey(key) ? '[redacted]' : value,
    ]),
  );
}

function redactProviderUrl(url: string) {
  try {
    const parsed = new URL(url);

    parsed.searchParams.forEach((_, key) => {
      if (isSensitiveKey(key)) {
        parsed.searchParams.set(key, '[redacted]');
      }
    });

    return parsed.toString();
  } catch {
    return url;
  }
}

function isSensitiveKey(key: string) {
  return /api[_-]?key|authorization|token|secret|access[_-]?key/i.test(key);
}

function isImagePayloadString(value: string) {
  if (/^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(value)) {
    return true;
  }

  const compact = value.replace(/\s/g, '');

  return compact.length > 80 && /^[A-Za-z0-9+/]+={0,2}$/.test(compact);
}

/**
 * 尝试解析字符串形式的 JSON 响应体。
 */
function parseJsonPayload(payload: string) {
  try {
    return JSON.parse(payload) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * 过滤响应体中可能包含密钥或图片内容的字段。
 */
function redactSensitivePayload(key: string, value: unknown) {
  if (/api[_-]?key|authorization|token|secret|b64|image|data/i.test(key)) {
    return '[redacted]';
  }

  if (typeof value === 'string') {
    return truncateProviderText(value);
  }

  return value;
}

/**
 * 裁剪过长的 provider 文本，避免日志输出过大。
 */
function truncateProviderText(value: string) {
  return value.length > 2000 ? `${value.slice(0, 2000)}...` : value;
}

/**
 * 从第三方错误响应中解析最有用的错误消息。
 */
function extractProviderErrorMessage(payload: unknown) {
  if (typeof payload === 'string') {
    const parsed = parseJsonPayload(payload);

    return parsed === undefined
      ? undefined
      : extractProviderErrorMessage(parsed);
  }

  if (!payload || typeof payload !== 'object') {
    return undefined;
  }

  const error = (payload as { error?: unknown }).error;

  if (typeof error === 'string') {
    return error;
  }

  if (error && typeof error === 'object') {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') {
      return message;
    }
  }

  const message = (payload as { message?: unknown }).message;
  return typeof message === 'string' ? message : undefined;
}

/**
 * 拼接基础地址和路径片段，并清理多余斜杠。
 */
function joinUrl(baseUrl: string, tail: string) {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
  const normalizedTail = tail.replace(/^\/+/, '');

  return `${normalizedBaseUrl}/${normalizedTail}`;
}

/**
 * 解析前端上传的 base64 data URL 参考图。
 */
function parseDataUrl(value: string) {
  const match = value.match(/^data:([^;,]+);base64,(.+)$/);

  if (!match) {
    throw new BadGatewayException('参考图必须是 base64 data URL');
  }

  return {
    mimeType: match[1],
    content: Buffer.from(match[2], 'base64'),
  };
}

/**
 * 日志中的图片内容只保留前 25 位，避免输出完整 base64。
 */
function truncateImageLogValue(value: string) {
  return value.length > 25 ? `${value.slice(0, 25)}...` : value;
}

/**
 * Google 请求体中 inlineData.data 是 base64，日志里需要截断。
 */
function truncateGoogleImageBody<T>(body: T): T {
  return JSON.parse(
    JSON.stringify(body, (key, value) =>
      key === 'data' && typeof value === 'string'
        ? truncateImageLogValue(value)
        : value,
    ),
  ) as T;
}

/**
 * 将图片 MIME 类型转换为上传文件名扩展名。
 */
function mimeTypeToExtension(mimeType: string) {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
    case 'image/png':
      return 'png';
    default:
      return 'png';
  }
}

/**
 * 将标准字段名映射为第三方字段名。
 */
function mapFieldName(
  mapping: ImageProviderFieldMapping | undefined,
  field: keyof NonNullable<ImageProviderFieldMapping>,
) {
  const mapped = mapping?.[field]?.trim();

  if (mapped) {
    return mapped;
  }

  switch (field) {
    case 'quantity':
      return 'n';
    case 'responseFormat':
      return 'response_format';
    default:
      return field;
  }
}

/**
 * 判断字段是否应发送；未配置时默认发送。
 */
function isFieldEnabled(
  overrides: ImageProviderFieldOverrides | undefined,
  field: keyof NonNullable<ImageProviderFieldOverrides>,
) {
  return overrides?.[field] ?? true;
}

/**
 * 将前端尺寸和分辨率映射为 OpenAI Images 兼容 size 参数。
 */
function toOpenAiSize(aspectRatio: AspectRatio, resolution: ImageResolution) {
  if (aspectRatio === 'auto') {
    return 'auto';
  }

  if (resolution === '0.5k') {
    return '512x512';
  }

  if (resolution === '2k') {
    return '2048x2048';
  }

  if (resolution === '4k') {
    return '4096x4096';
  }

  switch (aspectRatio) {
    case '4:3':
      return '1536x1024';
    case '3:4':
      return '1024x1536';
    case '16:9':
      return '1536x864';
    case '9:16':
      return '864x1536';
    case '1:1':
      return '1024x1024';
    default:
      return '1024x1024';
  }
}

/**
 * 将前端分辨率映射为兼容 OpenAI quality 的稳定值。
 */
function toOpenAiQuality(resolution: ImageResolution) {
  switch (resolution) {
    case '0.5k':
      return 'low';
    case '1k':
      return 'medium';
    case '2k':
    case '4k':
      return 'high';
    default:
      return 'medium';
  }
}

/**
 * 将前端分辨率映射为 Gemini imageSize。
 */
function toGeminiImageSize(resolution: ImageResolution) {
  switch (resolution) {
    case '0.5k':
    case '1k':
      return '1K';
    case '2k':
      return '2K';
    case '4k':
      return '4K';
    default:
      return '1K';
  }
}

/**
 * 从对象中读取简单点路径或数组展开路径。
 */
function getStringByPath(payload: unknown, path: string) {
  const value = getValuesByPath(payload, path)[0];

  return typeof value === 'string' ? value : undefined;
}

/**
 * 从对象中读取字符串数组。
 */
function getStringArrayByPath(payload: unknown, path: string) {
  return getValuesByPath(payload, path).filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
}

/**
 * 支持 `a.b` 与 `items[].url` 这类受控路径读取。
 */
type PathSegment = {
  key: string;
  index?: number;
  arrayAll: boolean;
};

function writeValueByPath(target: JsonValue, path: string, value: JsonValue) {
  const segments = parsePath(path);

  if (segments.length === 0) {
    throw new BadGatewayException('Path is required');
  }

  let current: JsonValue = target;

  segments.slice(0, -1).forEach((segment) => {
    if (segment.arrayAll) {
      throw new BadGatewayException(
        'Array expansion is only supported at the end of write paths',
      );
    }

    current = ensurePathChild(current, segment);
  });

  setPathValue(current, segments[segments.length - 1], value);
}

function ensurePathChild(current: JsonValue, segment: PathSegment) {
  if (!isJsonRecord(current)) {
    throw new BadGatewayException('Cannot write into non-object path segment');
  }

  if (segment.index !== undefined) {
    const existing = current[segment.key];
    const arrayValue = Array.isArray(existing) ? existing : [];

    current[segment.key] = arrayValue;

    if (!isJsonRecord(arrayValue[segment.index])) {
      arrayValue[segment.index] = {};
    }

    return arrayValue[segment.index];
  }

  if (!isJsonRecord(current[segment.key])) {
    current[segment.key] = {};
  }

  return current[segment.key];
}

function setPathValue(
  current: JsonValue,
  segment: PathSegment,
  value: JsonValue,
) {
  if (!isJsonRecord(current)) {
    throw new BadGatewayException('Cannot write into non-object path segment');
  }

  if (segment.arrayAll) {
    const existing = current[segment.key];
    const arrayValue = Array.isArray(existing) ? existing : [];

    arrayValue.push(value);
    current[segment.key] = arrayValue;
    return;
  }

  if (segment.index !== undefined) {
    const existing = current[segment.key];
    const arrayValue = Array.isArray(existing) ? existing : [];

    arrayValue[segment.index] = value;
    current[segment.key] = arrayValue;
    return;
  }

  current[segment.key] = value;
}

function getValuesByPath(payload: unknown, path: string) {
  const segments = parsePath(path);
  let values = [payload];

  segments.forEach((segment) => {
    const nextValues: unknown[] = [];

    values.forEach((value) => {
      if (!value || typeof value !== 'object') {
        return;
      }

      const nextValue = (value as Record<string, unknown>)[segment.key];

      if (segment.arrayAll) {
        if (Array.isArray(nextValue)) {
          nextValues.push(...nextValue);
        }
        return;
      }

      if (segment.index !== undefined) {
        if (Array.isArray(nextValue)) {
          nextValues.push(nextValue[segment.index]);
        }
        return;
      }

      nextValues.push(nextValue);
    });

    values = nextValues;
  });

  return values;
}

function parsePath(path: string): PathSegment[] {
  return path
    .split('.')
    .filter(Boolean)
    .map((segment) => {
      const match = segment.match(/^([^\[\]]+)(?:\[(\d*)\])?$/);

      if (!match) {
        throw new BadGatewayException(`Invalid path segment: ${segment}`);
      }

      return {
        key: match[1],
        index: match[2] && match[2] !== '' ? Number(match[2]) : undefined,
        arrayAll: match[2] === '',
      };
    });
}

/**
 * 等待指定毫秒数，用于异步 provider 任务轮询。
 */
function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
