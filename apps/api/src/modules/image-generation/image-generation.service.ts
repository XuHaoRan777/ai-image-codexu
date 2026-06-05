import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type {
  CreateImageJobInput,
  CreateImageModelConfigInput,
  ImageJob,
  ImageModelConfig,
  ImageProviderType,
  ImageQuantity,
  UpdateImageModelConfigEnabledInput,
  UpdateImageModelConfigInput,
} from '@ai-image-codexu/shared';
import { Repository } from 'typeorm';
import { maskSecret } from '../../common/utils/maskSecret';
import { decryptSecret, encryptSecret } from '../../common/utils/secretCrypto';
import { ImageModelConfigEntity } from '../../entity/ImageModelConfig';
import { ImageStorageService } from '../image-processing/image-storage.service';
import { ImageProviderDispatcher } from './image-generation.providers';

const now = () => new Date().toISOString();
const defaultModelNames: Record<ImageProviderType, string> = {
  openai: 'gpt-image-2',
  google: 'gemini-3.1-flash-image',
  onetopai: 'gpt-image-2',
};

@Injectable()
export class ImageGenerationService {
  private imageJobs: ImageJob[] = [];

  constructor(
    @InjectRepository(ImageModelConfigEntity)
    private readonly imageModelConfigRepository: Repository<ImageModelConfigEntity>,
    private readonly imageStorageService: ImageStorageService,
    private readonly imageProviderDispatcher: ImageProviderDispatcher,
  ) {}

  async listImageModelConfigs() {
    const configs = await this.imageModelConfigRepository.find({
      order: { createdAt: 'DESC' },
    });

    return configs.map((config) => this.toImageModelConfig(config));
  }

  async createImageModelConfig(input: CreateImageModelConfigInput) {
    const timestamp = new Date();
    const apiKey = input.apiKey?.trim() ?? '';
    const config = this.imageModelConfigRepository.create({
      id: crypto.randomUUID(),
      name: input.name,
      providerType: input.providerType,
      apiKeyMasked: apiKey ? (maskSecret(apiKey) ?? null) : null,
      apiKeyEncrypted: apiKey ? encryptSecret(apiKey) : null,
      modelNameOverride: input.modelNameOverride || null,
      enabled: input.enabled,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const saved = await this.imageModelConfigRepository.save(config);

    return this.toImageModelConfig(saved);
  }

  async updateImageModelConfig(
    id: string,
    input: UpdateImageModelConfigInput,
  ) {
    const existing = await this.imageModelConfigRepository.findOneBy({ id });

    if (!existing) {
      return null;
    }

    if (input.name !== undefined) {
      existing.name = input.name;
    }
    if (input.providerType !== undefined) {
      existing.providerType = input.providerType;
    }
    if (input.apiKey !== undefined && input.apiKey.trim() !== '') {
      const apiKey = input.apiKey.trim();
      existing.apiKeyMasked = maskSecret(apiKey) ?? null;
      existing.apiKeyEncrypted = encryptSecret(apiKey);
    }
    if (input.modelNameOverride !== undefined) {
      existing.modelNameOverride = input.modelNameOverride || null;
    }
    if (input.enabled !== undefined) {
      existing.enabled = input.enabled;
    }
    existing.updatedAt = new Date();

    const saved = await this.imageModelConfigRepository.save(existing);

    return this.toImageModelConfig(saved);
  }

  async updateImageModelConfigEnabled(
    id: string,
    input: UpdateImageModelConfigEnabledInput,
  ) {
    const existing = await this.imageModelConfigRepository.findOneBy({ id });

    if (!existing) {
      return null;
    }

    existing.enabled = input.enabled;
    existing.updatedAt = new Date();

    const saved = await this.imageModelConfigRepository.save(existing);

    return this.toImageModelConfig(saved);
  }

  async deleteImageModelConfig(id: string) {
    const result = await this.imageModelConfigRepository.delete({ id });

    return (result.affected ?? 0) > 0;
  }

  async createImageJob(input: CreateImageJobInput) {
    const config = await this.imageModelConfigRepository.findOneBy({
      id: input.configId,
      enabled: true,
    });

    if (!config) {
      throw new NotFoundException('可用的生图模型配置不存在');
    }

    const timestamp = now();
    const modelName = resolveModelName(config);
    const job: ImageJob = {
      id: crypto.randomUUID(),
      configId: config.id,
      configName: config.name,
      providerType: config.providerType,
      modelName,
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
      void this.runImageJob(job, config);
    }, 0);

    return job;
  }

  getImageJob(id: string) {
    return this.imageJobs.find((job) => job.id === id);
  }

  private async runImageJob(
    job: ImageJob,
    config: ImageModelConfigEntity,
  ) {
    job.status = 'running';
    job.updatedAt = now();

    try {
      const apiKey = decryptSecret(config.apiKeyEncrypted);

      if (!apiKey) {
        throw new Error('模型配置缺少 API key');
      }

      const images = await this.imageProviderDispatcher.generate({
        providerType: config.providerType,
        apiKey,
        modelName: job.modelName,
        prompt: job.prompt,
        aspectRatio: job.aspectRatio,
        resolution: job.resolution,
        quantity: job.quantity as ImageQuantity,
        referenceImages: job.referenceImages,
      });

      const imageUrls = await Promise.all(
        images.map((image, index) =>
          this.imageStorageService.saveImage(
            `generated/${job.id}-${index + 1}.${mimeTypeToExtension(
              image.mimeType,
            )}`,
            image.content,
          ),
        ),
      );

      job.status = 'succeeded';
      job.imageUrl = imageUrls[0];
      job.imageUrls = imageUrls;
      job.updatedAt = now();
    } catch (error) {
      job.status = 'failed';
      job.errorMessage =
        error instanceof Error ? error.message : '生图任务执行失败';
      job.updatedAt = now();
    }
  }

  private toImageModelConfig(
    entity: ImageModelConfigEntity,
  ): ImageModelConfig {
    return {
      id: entity.id,
      name: entity.name,
      providerType: entity.providerType,
      apiKeyMasked: entity.apiKeyMasked ?? undefined,
      modelNameOverride: entity.modelNameOverride ?? undefined,
      enabled: entity.enabled,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }
}

function resolveModelName(config: ImageModelConfigEntity) {
  return config.modelNameOverride || defaultModelNames[config.providerType];
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
