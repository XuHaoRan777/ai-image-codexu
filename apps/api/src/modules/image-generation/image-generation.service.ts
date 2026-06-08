import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type {
  CreateImageJobInput,
  CreateImageModelConfigInput,
  ImageJob,
  ImageJobStatus,
  ImageModelConfig,
  ImageProviderType,
  ImageQuantity,
  UpdateImageModelConfigEnabledInput,
  UpdateImageModelConfigInput,
} from '@ai-image-codexu/shared';
import { ImageProviderTypeEnum } from '@ai-image-codexu/shared';
import { Repository } from 'typeorm';
import { maskSecret } from '../../common/utils/maskSecret';
import { decryptSecret, encryptSecret } from '../../common/utils/secretCrypto';
import { ImageJobEntity } from '../../entity/ImageJob';
import { ImageModelConfigEntity } from '../../entity/ImageModelConfig';
import { ImageStorageService } from '../image-processing/image-storage.service';
import {
  ImageProviderDispatcher,
  resolveAiCodeWithModelName,
} from './image-generation.providers';

const defaultModelNames: Record<ImageProviderType, string> = {
  [ImageProviderTypeEnum.OpenAI]: 'gpt-image-2',
  [ImageProviderTypeEnum.Google]: 'gemini-3.1-flash-image',
  [ImageProviderTypeEnum.OneTopAI]: 'gpt-image-2',
  [ImageProviderTypeEnum.ImageYouyu]: 'image-youyu',
  [ImageProviderTypeEnum.AiCodeWith]: 'gpt-image-2',
};

@Injectable()
export class ImageGenerationService {
  /**
   * 注入模型配置仓储、图片存储服务和 provider 分发器。
   */
  constructor(
    @InjectRepository(ImageModelConfigEntity)
    private readonly imageModelConfigRepository: Repository<ImageModelConfigEntity>,
    @InjectRepository(ImageJobEntity)
    private readonly imageJobRepository: Repository<ImageJobEntity>,
    private readonly imageStorageService: ImageStorageService,
    private readonly imageProviderDispatcher: ImageProviderDispatcher,
  ) {}

  /**
   * 按创建时间倒序查询全部生图模型配置。
   */
  async listImageModelConfigs() {
    const configs = await this.imageModelConfigRepository.find({
      order: { createdAt: 'DESC' },
    });

    return configs.map((config) => this.toImageModelConfig(config));
  }

  /**
   * 创建生图模型配置，并将 API key 加密后持久化。
   */
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

  /**
   * 更新生图模型配置；密钥为空时保留原密钥。
   */
  async updateImageModelConfig(id: string, input: UpdateImageModelConfigInput) {
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

  /**
   * 只更新生图模型配置的启用状态。
   */
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

  /**
   * 删除指定生图模型配置。
   */
  async deleteImageModelConfig(id: string) {
    const result = await this.imageModelConfigRepository.delete({ id });

    return (result.affected ?? 0) > 0;
  }

  /**
   * 创建持久化生图任务，并异步启动真实生图流程。
   */
  async createImageJob(input: CreateImageJobInput) {
    const config = await this.imageModelConfigRepository.findOneBy({
      id: input.configId,
      enabled: true,
    });

    if (!config) {
      throw new NotFoundException('可用的生图模型配置不存在');
    }

    const timestamp = new Date();
    const modelName = resolveModelName(config, input);
    const job = this.imageJobRepository.create({
      id: crypto.randomUUID(),
      configId: config.id,
      configName: config.name,
      providerType: config.providerType,
      modelName,
      prompt: input.prompt,
      aspectRatio: input.aspectRatio,
      resolution: input.resolution,
      quantity: input.quantity,
      status: 'queued',
      imageUrl: null,
      imageUrls: null,
      errorMessage: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const savedJob = await this.imageJobRepository.save(job);

    setTimeout(() => {
      void this.runImageJob(savedJob.id, input.referenceImages, config);
    }, 0);

    return this.toImageJob(savedJob);
  }

  /**
   * 从数据库查询持久化生图任务历史列表。
   */
  async listImageJobs() {
    const jobs = await this.imageJobRepository.find({
      order: { createdAt: 'DESC' },
    });

    return jobs.map((job) => this.toImageJob(job));
  }

  /**
   * 从数据库查询指定生图任务。
   */
  async getImageJob(id: string) {
    const job = await this.imageJobRepository.findOneBy({ id });

    return job ? this.toImageJob(job) : null;
  }

  /**
   * 删除指定生图任务记录，并清理它关联的本地图片文件。
   */
  async deleteImageJob(id: string) {
    const job = await this.imageJobRepository.findOneBy({ id });

    if (!job) {
      return false;
    }

    const imageUrls = collectImageJobUrls(job);

    await Promise.all(
      imageUrls.map((imageUrl) =>
        this.imageStorageService.deleteImageByPublicUrl(imageUrl),
      ),
    );

    const result = await this.imageJobRepository.delete({ id });

    return (result.affected ?? 0) > 0;
  }

  /**
   * 执行真实 provider 请求，并把生成图片保存到本地存储。
   */
  private async runImageJob(
    jobId: string,
    referenceImages: string[] | undefined,
    config: ImageModelConfigEntity,
  ) {
    const job = await this.imageJobRepository.findOneBy({ id: jobId });

    if (!job) {
      return;
    }

    await this.updateImageJob(job, {
      status: 'running',
      updatedAt: new Date(),
    });

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
        referenceImages,
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

      await this.updateImageJob(job, {
        status: 'succeeded',
        imageUrl: imageUrls[0],
        imageUrls,
        errorMessage: null,
        updatedAt: new Date(),
      });
    } catch {
      await this.deleteImageJob(job.id);
    }
  }

  /**
   * 将数据库实体转换为前端可接收的配置结构。
   */
  private toImageModelConfig(entity: ImageModelConfigEntity): ImageModelConfig {
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

  /**
   * 将数据库任务实体转换为前端可接收的生图任务结构。
   */
  private toImageJob(entity: ImageJobEntity): ImageJob {
    return {
      id: entity.id,
      configId: entity.configId,
      configName: entity.configName,
      providerType: entity.providerType,
      modelName: entity.modelName,
      prompt: entity.prompt,
      aspectRatio: entity.aspectRatio,
      resolution: entity.resolution,
      quantity: entity.quantity,
      status: entity.status,
      imageUrl: entity.imageUrl ?? undefined,
      imageUrls: entity.imageUrls ?? undefined,
      errorMessage: entity.errorMessage ?? undefined,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }

  /**
   * 更新生图任务实体并立即持久化到数据库。
   */
  private async updateImageJob(
    job: ImageJobEntity,
    input: Partial<{
      status: ImageJobStatus;
      imageUrl: string | null;
      imageUrls: string[] | null;
      errorMessage: string | null;
      updatedAt: Date;
    }>,
  ) {
    const result = await this.imageJobRepository.update({ id: job.id }, input);

    if ((result.affected ?? 0) === 0) {
      return;
    }

    Object.assign(job, input);
  }
}

/**
 * 根据配置 override 或来源默认值决定任务实际记录的模型名。
 */
function resolveModelName(
  config: ImageModelConfigEntity,
  input: Pick<CreateImageJobInput, 'resolution' | 'quantity'>,
) {
  if (config.providerType === ImageProviderTypeEnum.AiCodeWith) {
    return resolveAiCodeWithModelName(input);
  }

  return config.modelNameOverride || defaultModelNames[config.providerType];
}

/**
 * 将图片 MIME 类型转换为本地文件扩展名。
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
 * 收集任务关联的全部公开图片 URL 并去重。
 */
function collectImageJobUrls(job: Pick<ImageJobEntity, 'imageUrl' | 'imageUrls'>) {
  return Array.from(
    new Set([
      ...(job.imageUrls ?? []),
      ...(job.imageUrl ? [job.imageUrl] : []),
    ]),
  );
}
