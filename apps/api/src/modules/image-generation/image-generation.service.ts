import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type {
  AiImageModelConfigRequest,
  CreateImageJobInput,
  CreateImageModelConfigInput,
  ImageJob,
  ImageJobStatus,
  ImageModelConfig,
  ImageQuantity,
  UpdateImageModelConfigEnabledInput,
  UpdateImageModelConfigInput,
} from '@ai-image-codexu/shared';
import { Repository } from 'typeorm';
import { maskSecret } from '../../common/utils/maskSecret';
import { decryptSecret, encryptSecret } from '../../common/utils/secretCrypto';
import { ImageJobEntity } from '../../entity/ImageJob';
import { ImageModelConfigEntity } from '../../entity/ImageModelConfig';
import { ImageStorageService } from '../image-processing/image-storage.service';
import { PromptOptimizerService } from '../prompt-optimizer/prompt-optimizer.service';
import { ImageProviderDispatcher } from './image-generation.providers';

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
    private readonly promptOptimizerService: PromptOptimizerService,
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

    if (input.enabled && !apiKey) {
      throw new BadRequestException('启用模型前请先填写 API key');
    }

    const config = this.imageModelConfigRepository.create({
      id: crypto.randomUUID(),
      name: input.name,
      providerType: input.providerType,
      deliveryMode: input.deliveryMode,
      baseUrl: input.baseUrl,
      generationPath: input.generationPath || null,
      editPath: input.editPath || null,
      apiKeyMasked: apiKey ? (maskSecret(apiKey) ?? null) : null,
      apiKeyEncrypted: apiKey ? encryptSecret(apiKey) : null,
      modelName: input.modelName ?? '',
      fieldMapping: input.fieldMapping ?? null,
      fieldOverrides: input.fieldOverrides ?? null,
      pollingConfig: input.pollingConfig ?? null,
      httpConfig: input.httpConfig ?? null,
      enabled: input.enabled,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const saved = await this.imageModelConfigRepository.save(config);

    return this.toImageModelConfig(saved);
  }

  /**
   * 使用辅助模型根据文档生成生图 HTTP 配置，并以未启用状态落库。
   */
  async createImageModelConfigWithAi(input: AiImageModelConfigRequest) {
    const generated =
      await this.promptOptimizerService.generateImageProviderConfig(input);
    const timestamp = new Date();
    const config = this.imageModelConfigRepository.create({
      id: crypto.randomUUID(),
      name: input.configName?.trim() || generated.name,
      providerType: generated.providerType,
      deliveryMode: generated.deliveryMode,
      baseUrl: generated.baseUrl ?? '',
      generationPath: generated.generationPath || null,
      editPath: generated.editPath || null,
      apiKeyMasked: null,
      apiKeyEncrypted: null,
      modelName: input.modelName?.trim() || generated.modelName || '',
      fieldMapping: generated.fieldMapping ?? null,
      fieldOverrides: generated.fieldOverrides ?? null,
      pollingConfig: generated.pollingConfig ?? null,
      httpConfig: generated.httpConfig,
      // AI 生成配置不写入密钥，必须默认未启用，等用户补 API key 后再启用。
      enabled: false,
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
    if (input.deliveryMode !== undefined) {
      existing.deliveryMode = input.deliveryMode;
    }
    if (input.baseUrl !== undefined) {
      existing.baseUrl = input.baseUrl;
    }
    if (input.generationPath !== undefined) {
      existing.generationPath = input.generationPath || null;
    }
    if (input.editPath !== undefined) {
      existing.editPath = input.editPath || null;
    }
    if (input.apiKey !== undefined && input.apiKey.trim() !== '') {
      const apiKey = input.apiKey.trim();
      existing.apiKeyMasked = maskSecret(apiKey) ?? null;
      existing.apiKeyEncrypted = encryptSecret(apiKey);
    }
    if (input.modelName !== undefined) {
      existing.modelName = input.modelName;
    }
    if (input.fieldMapping !== undefined) {
      existing.fieldMapping = input.fieldMapping ?? null;
    }
    if (input.fieldOverrides !== undefined) {
      existing.fieldOverrides = input.fieldOverrides ?? null;
    }
    if (input.pollingConfig !== undefined) {
      existing.pollingConfig = input.pollingConfig ?? null;
    }
    if (input.httpConfig !== undefined) {
      existing.httpConfig = input.httpConfig ?? null;
    }
    if (input.enabled !== undefined) {
      existing.enabled = input.enabled;
    }

    if (existing.enabled && !hasUsableApiKey(existing)) {
      throw new BadRequestException('启用模型前请先填写 API key');
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

    if (input.enabled && !hasUsableApiKey(existing)) {
      throw new BadRequestException('启用模型前请先填写 API key');
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
    const job = this.imageJobRepository.create({
      id: crypto.randomUUID(),
      configId: config.id,
      configName: config.name,
      providerType: config.providerType,
      modelName: config.modelName,
      prompt: input.prompt,
      aspectRatio: input.aspectRatio,
      resolution: input.resolution,
      quantity: input.quantity,
      status: 'queued',
      imageUrl: null,
      imageUrls: null,
      tokenUsage: null,
      inputTokenUsage: null,
      outputTokenUsage: null,
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

      if (!config.httpConfig) {
        throw new Error('Image model config is missing httpConfig');
      }

      const providerResult =
        await this.imageProviderDispatcher.generateConfiguredHttp({
          deliveryMode: config.deliveryMode,
          apiKey,
          httpConfig: config.httpConfig,
          prompt: job.prompt,
          aspectRatio: job.aspectRatio,
          resolution: job.resolution,
          quantity: job.quantity as ImageQuantity,
          referenceImages,
        });

      const imageUrls = await Promise.all(
        providerResult.images.map((image, index) =>
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
        tokenUsage: providerResult.tokenUsage ?? null,
        inputTokenUsage: providerResult.inputTokenUsage ?? null,
        outputTokenUsage: providerResult.outputTokenUsage ?? null,
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
      deliveryMode: entity.deliveryMode,
      baseUrl: entity.baseUrl,
      generationPath: entity.generationPath ?? undefined,
      editPath: entity.editPath ?? undefined,
      apiKeyMasked: entity.apiKeyMasked ?? undefined,
      modelName: entity.modelName,
      fieldMapping: entity.fieldMapping ?? undefined,
      fieldOverrides: entity.fieldOverrides ?? undefined,
      pollingConfig: entity.pollingConfig ?? undefined,
      httpConfig: entity.httpConfig ?? undefined,
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
      tokenUsage: entity.tokenUsage ?? undefined,
      inputTokenUsage: entity.inputTokenUsage ?? undefined,
      outputTokenUsage: entity.outputTokenUsage ?? undefined,
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
      tokenUsage: number | null;
      inputTokenUsage: number | null;
      outputTokenUsage: number | null;
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
function collectImageJobUrls(
  job: Pick<ImageJobEntity, 'imageUrl' | 'imageUrls'>,
) {
  return Array.from(
    new Set([
      ...(job.imageUrls ?? []),
      ...(job.imageUrl ? [job.imageUrl] : []),
    ]),
  );
}

/**
 * 启用模型前必须确认数据库里有真实可解密密钥；AI 生成配置只有模板，不会写入 API key。
 */
function hasUsableApiKey(
  entity: Pick<ImageModelConfigEntity, 'apiKeyEncrypted'>,
) {
  try {
    return Boolean(decryptSecret(entity.apiKeyEncrypted)?.trim());
  } catch {
    return false;
  }
}
