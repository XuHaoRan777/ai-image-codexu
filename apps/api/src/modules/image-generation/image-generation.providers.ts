import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import type {
  AspectRatio,
  ImageProviderType,
  ImageQuantity,
  ImageResolution,
} from '@ai-image-codexu/shared';
import { ImageProviderTypeEnum } from '@ai-image-codexu/shared';
import axios, { AxiosError } from 'axios';

export type ImageProviderRequest = {
  providerType: ImageProviderType;
  apiKey: string;
  modelName: string;
  prompt: string;
  aspectRatio: AspectRatio;
  resolution: ImageResolution;
  quantity: ImageQuantity;
  referenceImages?: string[];
};

const providerLogger = new Logger('ImageProviderDispatcher');

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

type AiCodeWithCreateTaskResponse = {
  id?: string;
  task_id?: string;
};

type AiCodeWithTaskResponse = {
  status?: string;
  progress?: number;
  result_data?: Array<{
    url?: string;
  }>;
  error?: unknown;
  message?: unknown;
};

@Injectable()
export class ImageProviderDispatcher {
  /**
   * 根据来源类型分发生图请求到对应 provider 方法。
   */
  async generate(request: ImageProviderRequest) {
    switch (request.providerType) {
      case ImageProviderTypeEnum.OpenAI:
        return this.callOpenAi(request);
      case ImageProviderTypeEnum.OneTopAI:
        return this.callOneTopAi(request);
      case ImageProviderTypeEnum.ImageYouyu:
        return this.callImageYouyu(request);
      case ImageProviderTypeEnum.AiCodeWith:
        return this.callAiCodeWith(request);
      case ImageProviderTypeEnum.Google:
        return this.callGoogleGeminiImage(request);
    }
  }

  /**
   * 调用 OpenAI 官方图片生成接口。
   */
  private async callOpenAi(
    request: ImageProviderRequest,
  ): Promise<GeneratedImage[]> {
    const baseUrl = 'https://api.openai.com/v1/images';

    if (request.referenceImages?.length) {
      const form = new FormData();
      form.set('model', request.modelName);
      form.set('prompt', request.prompt);
      form.set('n', String(request.quantity));
      form.set('size', toOpenAiSize(request.aspectRatio, request.resolution));

      request.referenceImages.forEach((image, index) => {
        const parsed = parseDataUrl(image);
        form.append(
          'image',
          new Blob([parsed.content], { type: parsed.mimeType }),
          `reference-${index + 1}.${mimeTypeToExtension(parsed.mimeType)}`,
        );
      });

      const response = await postWithProviderError<OpenAiImageResponse>(
        joinUrl(baseUrl, 'edits'),
        form,
        {
          Authorization: `Bearer ${request.apiKey}`,
        },
      );

      return this.extractOpenAiLikeImages(response);
    }

    const response = await postWithProviderError<OpenAiImageResponse>(
      joinUrl(baseUrl, 'generations'),
      {
        model: request.modelName,
        prompt: request.prompt,
        n: request.quantity,
        size: toOpenAiSize(request.aspectRatio, request.resolution),
      },
      {
        Authorization: `Bearer ${request.apiKey}`,
        'Content-Type': 'application/json',
      },
    );

    return this.extractOpenAiLikeImages(response);
  }

  /**
   * 调用 OneTopAI 图片生成接口。
   */
  private async callOneTopAi(
    request: ImageProviderRequest,
  ): Promise<GeneratedImage[]> {
    const baseUrl = 'https://www.onetopai.asia/v1/images';

    if (request.referenceImages?.length) {
      const form = new FormData();
      form.set('model', request.modelName);
      form.set('prompt', request.prompt);
      form.set('n', String(request.quantity));
      form.set('size', toOpenAiSize(request.aspectRatio, request.resolution));

      request.referenceImages.forEach((image, index) => {
        const parsed = parseDataUrl(image);
        form.append(
          'image',
          new Blob([parsed.content], { type: parsed.mimeType }),
          `reference-${index + 1}.${mimeTypeToExtension(parsed.mimeType)}`,
        );
      });

      const response = await postWithProviderError<OpenAiImageResponse>(
        joinUrl(baseUrl, 'edits'),
        form,
        {
          Authorization: `Bearer ${request.apiKey}`,
        },
      );

      return this.extractOpenAiLikeImages(response);
    }

    const response = await postWithProviderError<OpenAiImageResponse>(
      joinUrl(baseUrl, 'generations'),
      {
        model: request.modelName,
        prompt: request.prompt,
        n: request.quantity,
        size: toOpenAiSize(request.aspectRatio, request.resolution),
      },
      {
        Authorization: `Bearer ${request.apiKey}`,
        'Content-Type': 'application/json',
      },
    );

    return this.extractOpenAiLikeImages(response);
  }

  /**
   * 调用 image-youyu 图片接口；该来源请求体不发送 model 字段。
   */
  private async callImageYouyu(
    request: ImageProviderRequest,
  ): Promise<GeneratedImage[]> {
    const baseUrl = 'https://image.youyu.help/v1/images';
    const size = toImageYouyuSize(request.aspectRatio);
    const quality = toImageYouyuQuality(request.resolution);

    if (request.referenceImages?.length) {
      const form = new FormData();
      form.set('prompt', request.prompt);
      form.set('quality', quality);
      form.set('size', size);
      form.set('output_format', 'png');
      form.set('n', String(request.quantity));

      request.referenceImages.forEach((image, index) => {
        const parsed = parseDataUrl(image);
        form.append(
          'image',
          new Blob([parsed.content], { type: parsed.mimeType }),
          `reference-${index + 1}.${mimeTypeToExtension(parsed.mimeType)}`,
        );
      });

      const response = await postWithProviderError<OpenAiImageResponse>(
        joinUrl(baseUrl, 'edits'),
        form,
        {
          Authorization: `Bearer ${request.apiKey}`,
        },
      );

      return this.extractOpenAiLikeImages(response);
    }

    const response = await postWithProviderError<OpenAiImageResponse>(
      joinUrl(baseUrl, 'generations'),
      {
        prompt: request.prompt,
        quality,
        size,
        output_format: 'png',
        n: request.quantity,
      },
      {
        Authorization: `Bearer ${request.apiKey}`,
        'Content-Type': 'application/json',
      },
    );

    return this.extractOpenAiLikeImages(response);
  }

  /**
   * 调用 AiCodeWith 图像工作站接口；该来源先创建任务，再轮询任务结果 URL。
   */
  private async callAiCodeWith(
    request: ImageProviderRequest,
  ): Promise<GeneratedImage[]> {
    const baseUrl = 'https://api.aicodewith.com';
    const pollIntervalMs = 5_000;
    const pollTimeoutMs = 300_000;

    if (request.referenceImages?.length) {
      throw new BadGatewayException(
        'AiCodeWith 图生图需要公网可访问 image_urls，当前参考图上传暂不支持',
      );
    }

    const model = resolveAiCodeWithModelName(request);
    const createBody =
      model === 'gpt-image-2-beta'
        ? {
            model,
            prompt: request.prompt,
            size: toAiCodeWithSize(request.aspectRatio),
          }
        : {
            model,
            prompt: request.prompt,
            size: toAiCodeWithSize(request.aspectRatio),
            resolution: toAiCodeWithResolution(request.resolution),
            n: request.quantity,
            quality: toAiCodeWithQuality(request.resolution),
          };
    const createResponse =
      await postWithProviderError<AiCodeWithCreateTaskResponse>(
        joinUrl(baseUrl, 'v1/images/generations'),
        createBody,
        {
          Authorization: `Bearer ${request.apiKey}`,
          'Content-Type': 'application/json',
        },
      );
    const taskId = createResponse.id ?? createResponse.task_id;

    if (!taskId) {
      throw new BadGatewayException('AiCodeWith 生图接口未返回任务 ID');
    }

    const startedAt = Date.now();

    while (Date.now() - startedAt <= pollTimeoutMs) {
      const task = await getWithProviderError<AiCodeWithTaskResponse>(
        joinUrl(baseUrl, `v1/tasks/${taskId}`),
        {
          Authorization: `Bearer ${request.apiKey}`,
        },
      );

      if (task.status === 'completed') {
        const urls =
          task.result_data
            ?.map((item) => item.url)
            .filter((url): url is string => Boolean(url)) ?? [];

        if (urls.length === 0) {
          throw new BadGatewayException('AiCodeWith 生图任务未返回图片 URL');
        }

        return this.extractOpenAiLikeImages({
          data: urls.map((url) => ({ url })),
        });
      }

      if (task.status === 'failed') {
        logProviderResponsePayload(task);
        throw new BadGatewayException(
          extractProviderErrorMessage(task) ?? 'AiCodeWith 生图任务失败',
        );
      }

      await delay(pollIntervalMs);
    }

    throw new BadGatewayException('AiCodeWith 生图任务轮询超时');
  }

  /**
   * 调用 Google Gemini 图像生成接口。
   */
  private async callGoogleGeminiImage(
    request: ImageProviderRequest,
  ): Promise<GeneratedImage[]> {
    const baseUrl = 'https://generativelanguage.googleapis.com/v1/models';
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
      candidateCount: request.quantity,
      responseModalities: ['TEXT', 'IMAGE'],
    };

    if (request.aspectRatio !== 'auto') {
      generationConfig.imageConfig = {
        aspectRatio: request.aspectRatio,
      };
    }

    const response = await postWithProviderError<GeminiImageResponse>(
      joinUrl(
        baseUrl,
        `${request.modelName}:generateContent`,
      ),
      {
        contents: [
          {
            parts,
          },
        ],
        generationConfig,
      },
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

    return Promise.all(
      images.map(async (image): Promise<GeneratedImage> => {
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
      }),
    );
  }
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
      timeout: 300_000,
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
      timeout: 300_000,
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
 * 将前端分辨率映射为 image-youyu 支持的 quality 参数。
 */
function toImageYouyuQuality(resolution: ImageResolution) {
  switch (resolution) {
    case '2k':
    case '4k':
      return '2k';
    case '0.5k':
    case '1k':
      return '1k';
  }
}

/**
 * 将前端尺寸映射为 image-youyu 支持的 size 参数。
 */
function toImageYouyuSize(aspectRatio: AspectRatio) {
  switch (aspectRatio) {
    case '4:3':
    case '16:9':
      return '1536x1024';
    case '3:4':
    case '9:16':
      return '1024x1536';
    case 'auto':
    case '1:1':
      return '1024x1024';
  }
}

type AiCodeWithModelSelectionInput = {
  resolution: ImageResolution;
  quantity: number;
};

/**
 * 判断 AiCodeWith 是否应使用 gpt-image-2-beta 快速模型。
 */
function shouldUseAiCodeWithBetaModel(request: AiCodeWithModelSelectionInput) {
  return request.resolution === '1k' && request.quantity === 1;
}

/**
 * 根据当前请求参数决定 AiCodeWith 实际请求模型。
 */
export function resolveAiCodeWithModelName(
  request: AiCodeWithModelSelectionInput,
) {
  return shouldUseAiCodeWithBetaModel(request)
    ? 'gpt-image-2-beta'
    : 'gpt-image-2';
}

/**
 * 将前端尺寸映射为 AiCodeWith 支持的 size 参数。
 */
function toAiCodeWithSize(aspectRatio: AspectRatio) {
  return aspectRatio;
}

/**
 * 将前端分辨率映射为 AiCodeWith 支持的 resolution 参数。
 */
function toAiCodeWithResolution(resolution: ImageResolution) {
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
 * 将前端分辨率映射为 AiCodeWith 支持的 quality 参数。
 */
function toAiCodeWithQuality(resolution: ImageResolution) {
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
 * 等待指定毫秒数，用于异步 provider 任务轮询。
 */
function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
