import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateImageJobInput,
  CreateImageModelConfigInput,
  ImageJob,
  ImageModelConfig,
  UpdateImageModelConfigInput,
} from '@ai-image-codexu/shared';
import { maskSecret } from '../../common/utils/maskSecret';
import { ImageStorageService } from '../image-processing/image-storage.service';

const now = () => new Date().toISOString();

@Injectable()
export class ImageGenerationService {
  private imageModelConfigs: ImageModelConfig[] = [
    {
      id: crypto.randomUUID(),
      name: '默认 OpenAI 中转',
      modelType: 'gpt-image-2',
      baseUrl: 'https://api.example.com/v1/images',
      apiKeyMasked: 'sk-****demo',
      modelNameOverride: 'gpt-image-2',
      enabled: true,
      createdAt: now(),
      updatedAt: now(),
    },
    {
      id: crypto.randomUUID(),
      name: '默认 Nano Banana 2 中转',
      modelType: 'nano-banana-2',
      baseUrl: 'https://api.example.com/v1/gemini',
      apiKeyMasked: 'gb-****demo',
      modelNameOverride: 'gemini-3.1-flash-image',
      enabled: true,
      createdAt: now(),
      updatedAt: now(),
    },
  ];

  private imageJobs: ImageJob[] = [];

  constructor(private readonly imageStorageService: ImageStorageService) {}

  listImageModelConfigs() {
    return this.imageModelConfigs;
  }

  createImageModelConfig(input: CreateImageModelConfigInput) {
    const timestamp = now();
    const config: ImageModelConfig = {
      id: crypto.randomUUID(),
      name: input.name,
      modelType: input.modelType,
      baseUrl: input.baseUrl,
      apiKeyMasked: maskSecret(input.apiKey),
      modelNameOverride: input.modelNameOverride,
      enabled: input.enabled,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.imageModelConfigs.unshift(config);
    return config;
  }

  updateImageModelConfig(id: string, input: UpdateImageModelConfigInput) {
    const existing = this.imageModelConfigs.find((config) => config.id === id);

    if (!existing) {
      return null;
    }

    Object.assign(existing, {
      ...input,
      apiKeyMasked:
        input.apiKey === undefined
          ? existing.apiKeyMasked
          : maskSecret(input.apiKey),
      updatedAt: now(),
    });

    return existing;
  }

  deleteImageModelConfig(id: string) {
    const initialLength = this.imageModelConfigs.length;
    this.imageModelConfigs = this.imageModelConfigs.filter(
      (config) => config.id !== id,
    );

    return this.imageModelConfigs.length !== initialLength;
  }

  createImageJob(input: CreateImageJobInput) {
    const config = this.imageModelConfigs.find(
      (item) => item.id === input.configId && item.enabled,
    );

    if (!config) {
      throw new NotFoundException('可用的生图模型配置不存在');
    }

    const timestamp = now();
    const job: ImageJob = {
      id: crypto.randomUUID(),
      configId: config.id,
      configName: config.name,
      modelType: config.modelType,
      prompt: input.prompt,
      aspectRatio: input.aspectRatio,
      resolution: input.resolution,
      quantity: input.quantity,
      referenceImages: input.referenceImages,
      status: 'queued',
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.imageJobs.unshift(job);

    setTimeout(() => {
      job.status = 'succeeded';
      job.imageUrl = this.imageStorageService.toPublicUrl(`${job.id}.png`);
      job.updatedAt = now();
    }, 1200);

    return job;
  }

  getImageJob(id: string) {
    return this.imageJobs.find((job) => job.id === id);
  }
}
