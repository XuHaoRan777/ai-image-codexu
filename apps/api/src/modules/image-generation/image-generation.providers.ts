import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import type {
  AspectRatio,
  ImageProviderType,
  ImageQuantity,
  ImageResolution,
} from '@ai-image-codexu/shared';
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

const openAiImagesBaseUrl = 'https://api.openai.com/v1/images';
const oneTopAiImagesBaseUrl = 'https://www.onetopai.asia/v1/images';
const imageYouyuImagesBaseUrl = 'https://image.youyu.help/v1/images';
const googleGeminiModelsBaseUrl =
  'https://generativelanguage.googleapis.com/v1/models';
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

@Injectable()
export class ImageProviderDispatcher {
  /**
   * 根据来源类型分发生图请求到对应 provider 方法。
   */
  async generate(request: ImageProviderRequest) {
    switch (request.providerType) {
      case 'openai':
        return this.callOpenAi(request);
      case 'onetopai':
        return this.callOneTopAi(request);
      case 'image-youyu':
        return this.callImageYouyu(request);
      case 'google':
        return this.callGoogleGeminiImage(request);
    }
  }

  /**
   * 调用 OpenAI 官方图片生成接口。
   */
  private async callOpenAi(request: ImageProviderRequest) {
    return this.callOpenAiImagesCompatible(request, openAiImagesBaseUrl);
  }

  /**
   * 调用 OneTopAI 的 OpenAI Images 兼容接口。
   */
  private async callOneTopAi(request: ImageProviderRequest) {
    return this.callOpenAiImagesCompatible(request, oneTopAiImagesBaseUrl);
  }

  /**
   * 调用 image-youyu 图片接口；该来源请求体不发送 model 字段。
   */
  private async callImageYouyu(
    request: ImageProviderRequest,
  ): Promise<GeneratedImage[]> {
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
        joinUrl(imageYouyuImagesBaseUrl, 'edits'),
        form,
        {
          Authorization: `Bearer ${request.apiKey}`,
        },
      );

      return this.extractOpenAiImages(response);
    }

    const response = await postWithProviderError<OpenAiImageResponse>(
      joinUrl(imageYouyuImagesBaseUrl, 'generations'),
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

    return this.extractOpenAiImages(response);
  }

  /**
   * 调用 OpenAI Images 兼容接口，并根据是否有参考图选择 generations 或 edits。
   */
  private async callOpenAiImagesCompatible(
    request: ImageProviderRequest,
    baseUrl: string,
  ): Promise<GeneratedImage[]> {
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

      return this.extractOpenAiImages(response);
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

    return this.extractOpenAiImages(response);
  }

  /**
   * 调用 Google Gemini 图像生成接口。
   */
  private async callGoogleGeminiImage(
    request: ImageProviderRequest,
  ): Promise<GeneratedImage[]> {
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
        googleGeminiModelsBaseUrl,
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
  private extractOpenAiImages(response: OpenAiImageResponse) {
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
      timeout: 120_000,
    });

    return response.data;
  } catch (error) {
    if (error instanceof AxiosError) {
      const message =
        extractProviderErrorMessage(error.response?.data) ||
        error.message ||
        '外部生图接口请求失败';
      providerLogger.error(
        JSON.stringify({
          message: 'Provider image response',
          status: error.response?.status,
          response: summarizeProviderPayload(error.response?.data),
        }),
      );

      throw new BadGatewayException(message);
    }

    throw error;
  }
}

/**
 * 将第三方响应体裁剪并脱敏，供错误日志记录。
 */
function summarizeProviderPayload(payload: unknown) {
  if (payload === undefined || payload === null) {
    return undefined;
  }

  const text =
    typeof payload === 'string'
      ? payload
      : JSON.stringify(payload, redactSensitivePayload);

  return text.length > 2000 ? `${text.slice(0, 2000)}...` : text;
}

/**
 * 过滤响应体中可能包含密钥或图片内容的字段。
 */
function redactSensitivePayload(key: string, value: unknown) {
  if (/api[_-]?key|authorization|token|secret|b64|image|data/i.test(key)) {
    return '[redacted]';
  }

  return value;
}

/**
 * 从第三方错误响应中解析最有用的错误消息。
 */
function extractProviderErrorMessage(payload: unknown) {
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
