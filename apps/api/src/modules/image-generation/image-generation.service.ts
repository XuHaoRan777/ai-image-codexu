import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type {
  CreateImageJobInput,
  CreateImageModelConfigInput,
  ImageJob,
  ImageModelConfig,
  UpdateImageModelConfigEnabledInput,
  UpdateImageModelConfigInput,
} from '@ai-image-codexu/shared';
import { Repository } from 'typeorm';
import { maskSecret } from '../../common/utils/maskSecret';
import { encryptSecret } from '../../common/utils/secretCrypto';
import { ImageModelConfigEntity } from '../../entity/ImageModelConfig';
import { ImageStorageService } from '../image-processing/image-storage.service';

const now = () => new Date().toISOString();

@Injectable()
export class ImageGenerationService {
  private imageJobs: ImageJob[] = [];

  constructor(
    @InjectRepository(ImageModelConfigEntity)
    private readonly imageModelConfigRepository: Repository<ImageModelConfigEntity>,
    private readonly imageStorageService: ImageStorageService,
  ) {}

  async listImageModelConfigs() {
    const configs = await this.imageModelConfigRepository.find({
      order: { createdAt: 'DESC' },
    });

    return configs.map((config) => this.toImageModelConfig(config));
  }

  async createImageModelConfig(input: CreateImageModelConfigInput) {
    const timestamp = new Date();
    const apiKey = input.apiKey.trim();
    const config = this.imageModelConfigRepository.create({
      id: crypto.randomUUID(),
      name: input.name,
      modelType: input.modelType,
      baseUrl: input.baseUrl,
      apiKeyMasked: maskSecret(apiKey) ?? null,
      apiKeyEncrypted: encryptSecret(apiKey),
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
    if (input.modelType !== undefined) {
      existing.modelType = input.modelType;
    }
    if (input.baseUrl !== undefined) {
      existing.baseUrl = input.baseUrl;
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

  private toImageModelConfig(
    entity: ImageModelConfigEntity,
  ): ImageModelConfig {
    return {
      id: entity.id,
      name: entity.name,
      modelType: entity.modelType,
      baseUrl: entity.baseUrl,
      apiKeyMasked: entity.apiKeyMasked ?? undefined,
      modelNameOverride: entity.modelNameOverride ?? undefined,
      enabled: entity.enabled,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }
}
