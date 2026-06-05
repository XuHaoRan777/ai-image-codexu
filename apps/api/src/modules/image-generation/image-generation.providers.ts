import { BadGatewayException, Injectable } from '@nestjs/common';
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
const googleGeminiModelsBaseUrl =
  'https://generativelanguage.googleapis.com/v1/models';

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
  async generate(request: ImageProviderRequest) {
    switch (request.providerType) {
      case 'openai':
        return this.callOpenAi(request);
      case 'onetopai':
        return this.callOneTopAi(request);
      case 'google':
        return this.callGoogleGeminiImage(request);
    }
  }

  private async callOpenAi(request: ImageProviderRequest) {
    return this.callOpenAiImagesCompatible(request, openAiImagesBaseUrl);
  }

  private async callOneTopAi(request: ImageProviderRequest) {
    return this.callOpenAiImagesCompatible(request, oneTopAiImagesBaseUrl);
  }

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

    const response = await postWithProviderError<GeminiImageResponse>(
      joinUrl(googleGeminiModelsBaseUrl, `${request.modelName}:generateContent`),
      {
        contents: [
          {
            parts,
          },
        ],
        generationConfig: {
          candidateCount: request.quantity,
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: {
            aspectRatio: request.aspectRatio,
          },
        },
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

      throw new BadGatewayException(message);
    }

    throw error;
  }
}

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

function joinUrl(baseUrl: string, tail: string) {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
  const normalizedTail = tail.replace(/^\/+/, '');

  return `${normalizedBaseUrl}/${normalizedTail}`;
}

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

function toOpenAiSize(aspectRatio: AspectRatio, resolution: ImageResolution) {
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
