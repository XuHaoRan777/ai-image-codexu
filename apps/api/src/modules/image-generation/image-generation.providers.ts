import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import type {
  AspectRatio,
  ImageProviderDeliveryMode,
  ImageProviderFieldMapping,
  ImageProviderFieldOverrides,
  ImageProviderPollingConfig,
  ImageProviderType,
  ImageQuantity,
  ImageResolution,
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

const providerLogger = new Logger('ImageProviderDispatcher');
const defaultProviderTimeoutMs = 300_000;
const defaultOpenAiGenerationPath = '/v1/images/generations';
const defaultOpenAiEditPath = '/v1/images/edits';
const defaultPollingIntervalMs = 5_000;
const defaultPollingTimeoutMs = 300_000;

type GeneratedImage = {
  content: Buffer;
  mimeType: string;
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

    return postWithProviderError<unknown>(
      url,
      body,
      {
        Authorization: `Bearer ${request.apiKey}`,
        'Content-Type': 'application/json',
      },
    );
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

    const url = joinUrl(request.baseUrl, request.editPath || defaultOpenAiEditPath);

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
function getValuesByPath(payload: unknown, path: string) {
  const segments = path.split('.').filter(Boolean);
  let values = [payload];

  segments.forEach((segment) => {
    const isArraySegment = segment.endsWith('[]');
    const key = isArraySegment ? segment.slice(0, -2) : segment;
    const nextValues: unknown[] = [];

    values.forEach((value) => {
      if (!value || typeof value !== 'object') {
        return;
      }

      const nextValue = (value as Record<string, unknown>)[key];

      if (isArraySegment) {
        if (Array.isArray(nextValue)) {
          nextValues.push(...nextValue);
        }
        return;
      }

      nextValues.push(nextValue);
    });

    values = nextValues;
  });

  return values;
}

/**
 * 等待指定毫秒数，用于异步 provider 任务轮询。
 */
function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
