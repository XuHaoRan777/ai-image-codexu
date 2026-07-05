import type { Repository } from 'typeorm';
import {
  ImageProviderTypeEnum,
  type ImageProviderHttpConfig,
} from '@ai-image-codexu/shared';
import { decryptSecret } from '../../common/utils/secretCrypto';
import { ImageJobEntity } from '../../entity/ImageJob';
import { ImageModelConfigEntity } from '../../entity/ImageModelConfig';
import { ImageStorageService } from '../image-processing/image-storage.service';
import { PromptOptimizerService } from '../prompt-optimizer/prompt-optimizer.service';
import { ImageProviderDispatcher } from './image-generation.providers';
import { ImageGenerationService } from './image-generation.service';

describe('ImageGenerationService', () => {
  let modelRepository: Repository<ImageModelConfigEntity>;
  let jobRepository: Repository<ImageJobEntity>;
  let dispatcher: ImageProviderDispatcher;
  let promptOptimizerService: { generateImageProviderConfig: jest.Mock };
  let service: ImageGenerationService;
  let deletedImageUrls: string[];

  beforeEach(() => {
    jest.useFakeTimers();
    modelRepository = createMemoryRepository<ImageModelConfigEntity>();
    jobRepository = createMemoryRepository<ImageJobEntity>();
    deletedImageUrls = [];
    dispatcher = {
      generate: jest.fn(),
      generateConfiguredHttp: jest.fn(async () => ({
        images: [
          {
            content: Buffer.from('image'),
            mimeType: 'image/png',
          },
        ],
        tokenUsage: 42,
        inputTokenUsage: 17,
        outputTokenUsage: 25,
      })),
    } as unknown as ImageProviderDispatcher;
    promptOptimizerService = {
      generateImageProviderConfig: jest.fn(),
    };
    service = new ImageGenerationService(
      modelRepository,
      jobRepository,
      {
        saveImage: async (relativePath: string) => `/api/images/${relativePath}`,
        toPublicUrl: (relativePath: string) => `/api/images/${relativePath}`,
        deleteImageByPublicUrl: async (publicUrl: string) => {
          deletedImageUrls.push(publicUrl);
          return true;
        },
      } as ImageStorageService,
      dispatcher,
      promptOptimizerService as unknown as PromptOptimizerService,
    );
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('lists persisted image model configs without test seeds', async () => {
    await expect(service.listImageModelConfigs()).resolves.toHaveLength(0);
  });

  it('creates and updates image model configs with encrypted API keys', async () => {
    const created = await service.createImageModelConfig({
      name: 'custom',
      providerType: ImageProviderTypeEnum.ConfigurableHttp,
      deliveryMode: 'sync',
      baseUrl: 'https://example.com',
      generationPath: '/v1/images/generations',
      editPath: '/v1/images/edits',
      apiKey: 'sk-test-secret',
      modelName: 'gpt-image-2',
      fieldMapping: {},
      fieldOverrides: { quality: false },
      httpConfig: createHttpConfig(),
      enabled: true,
    });

    expect(created.providerType).toBe('configurable-http');
    expect(created.baseUrl).toBe('https://example.com');
    expect(created.fieldOverrides).toEqual({ quality: false });
    expect(created.apiKeyMasked).toBe('sk-****cret');
    const stored = await modelRepository.findOneBy({ id: created.id });
    expect(stored?.apiKeyEncrypted).toBeDefined();
    expect(stored?.apiKeyEncrypted).not.toContain('sk-test-secret');
    expect(decryptSecret(stored?.apiKeyEncrypted)).toBe('sk-test-secret');

    const updated = await service.updateImageModelConfig(created.id, {
      apiKey: '',
      enabled: false,
      modelName: 'gpt-image-2-beta',
      fieldOverrides: { quantity: false },
    });

    expect(updated?.enabled).toBe(false);
    expect(updated?.modelName).toBe('gpt-image-2-beta');
    expect(updated?.fieldOverrides).toEqual({ quantity: false });
    expect(updated?.apiKeyMasked).toBe(created.apiKeyMasked);
    await expect(
      modelRepository.findOneBy({ id: created.id }),
    ).resolves.toMatchObject({
      apiKeyEncrypted: stored?.apiKeyEncrypted,
    });
  });

  it('updates image model config enabled state only', async () => {
    const created = await service.createImageModelConfig({
      name: 'custom',
      providerType: ImageProviderTypeEnum.ConfigurableHttp,
      deliveryMode: 'sync',
      baseUrl: 'https://example.com',
      apiKey: 'sk-test-secret',
      modelName: 'gpt-image-2',
      httpConfig: createHttpConfig(),
      enabled: true,
    });
    const storedBefore = await modelRepository.findOneBy({ id: created.id });
    const updated = await service.updateImageModelConfigEnabled(created.id, {
      enabled: false,
    });

    expect(updated?.enabled).toBe(false);
    expect(updated?.name).toBe(created.name);
    expect(updated?.apiKeyMasked).toBe(created.apiKeyMasked);
    await expect(
      modelRepository.findOneBy({ id: created.id }),
    ).resolves.toMatchObject({
      apiKeyEncrypted: storedBefore?.apiKeyEncrypted,
      enabled: false,
    });
  });

  it('creates AI generated image model configs disabled without API key', async () => {
    promptOptimizerService.generateImageProviderConfig.mockResolvedValue({
      name: 'Generated Nano',
      providerType: ImageProviderTypeEnum.ConfigurableHttp,
      deliveryMode: 'sync',
      baseUrl: '',
      generationPath: '',
      editPath: '',
      modelName: 'nano-banana',
      fieldMapping: {},
      fieldOverrides: {},
      pollingConfig: {},
      httpConfig: createHttpConfig(),
      enabled: false,
    });

    const created = await service.createImageModelConfigWithAi({
      configName: 'AI Generated',
      modelName: 'model-from-user',
      sourceText: 'API docs',
    });

    expect(created.name).toBe('AI Generated');
    expect(created.modelName).toBe('model-from-user');
    expect(created.providerType).toBe('configurable-http');
    expect(created.enabled).toBe(false);
    expect(created.apiKeyMasked).toBeUndefined();
    expect(created.httpConfig).toEqual(createHttpConfig());
    await expect(
      modelRepository.findOneBy({ id: created.id }),
    ).resolves.toMatchObject({
      apiKeyEncrypted: null,
      apiKeyMasked: null,
      enabled: false,
    });
  });

  it('rejects enabling image model configs without a stored API key', async () => {
    const created = await service.createImageModelConfig({
      name: 'disabled',
      providerType: ImageProviderTypeEnum.ConfigurableHttp,
      deliveryMode: 'sync',
      baseUrl: 'https://example.com',
      apiKey: '',
      modelName: 'gpt-image-2',
      httpConfig: createHttpConfig(),
      enabled: false,
    });

    await expect(
      service.updateImageModelConfigEnabled(created.id, { enabled: true }),
    ).rejects.toThrow('启用模型前请先填写 API key');
    await expect(
      service.updateImageModelConfig(created.id, { enabled: true }),
    ).rejects.toThrow('启用模型前请先填写 API key');
  });

  it('creates image jobs with selected config', async () => {
    const config = await service.createImageModelConfig({
      name: 'custom',
      providerType: ImageProviderTypeEnum.ConfigurableHttp,
      deliveryMode: 'sync',
      baseUrl: 'https://example.com',
      generationPath: '/v1/images/generations',
      editPath: '/v1/images/edits',
      apiKey: 'sk-test-secret',
      modelName: 'gpt-image-2',
      httpConfig: createHttpConfig(),
      enabled: true,
    });
    const job = await service.createImageJob({
      configId: config.id,
      prompt: 'test prompt',
      aspectRatio: 'auto',
      resolution: '1k',
      quantity: 1,
    });

    expect(job.status).toBe('queued');
    expect(job.configId).toBe(config.id);
    expect(job.providerType).toBe('configurable-http');
    expect(job.modelName).toBe('gpt-image-2');
    expect(job.aspectRatio).toBe('auto');
    expect(job.resolution).toBe('1k');
    expect(job.quantity).toBe(1);
    await expect(jobRepository.findOneBy({ id: job.id })).resolves.toMatchObject({
      status: 'queued',
      imageUrl: null,
      imageUrls: null,
    });

    await jest.runAllTimersAsync();

    const updated = await service.getImageJob(job.id);
    expect(updated?.status).toBe('succeeded');
    expect(updated?.imageUrl).toBe(`/api/images/generated/${job.id}-1.png`);
    expect(updated?.tokenUsage).toBe(42);
    expect(updated?.inputTokenUsage).toBe(17);
    expect(updated?.outputTokenUsage).toBe(25);
    await expect(service.listImageJobs()).resolves.toEqual([
      expect.objectContaining({
        id: job.id,
        status: 'succeeded',
        imageUrl: `/api/images/generated/${job.id}-1.png`,
        tokenUsage: 42,
        inputTokenUsage: 17,
        outputTokenUsage: 25,
      }),
    ]);
    expect(dispatcher.generateConfiguredHttp).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryMode: 'sync',
        httpConfig: createHttpConfig(),
      }),
    );
  });

  it('uses the configured model name for low capability channel configs', async () => {
    const config = await service.createImageModelConfig({
      name: 'aicodewith beta',
      providerType: ImageProviderTypeEnum.ConfigurableHttp,
      deliveryMode: 'polling',
      baseUrl: 'https://api.aicodewith.com',
      apiKey: 'sk-test-secret',
      modelName: 'gpt-image-2-beta',
      fieldOverrides: {
        quantity: false,
        quality: false,
        resolution: false,
      },
      httpConfig: createHttpConfig(),
      enabled: true,
    });
    const job = await service.createImageJob({
      configId: config.id,
      prompt: 'test prompt',
      aspectRatio: '1:1',
      resolution: '1k',
      quantity: 1,
    });

    expect(job.modelName).toBe('gpt-image-2-beta');

    await jest.runAllTimersAsync();

    expect(dispatcher.generateConfiguredHttp).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryMode: 'polling',
        httpConfig: createHttpConfig(),
      }),
    );
  });

  it('removes image job records when provider throws', async () => {
    jest
      .spyOn(dispatcher, 'generateConfiguredHttp')
      .mockRejectedValueOnce(new Error('provider failed'));
    const config = await service.createImageModelConfig({
      name: 'custom',
      providerType: ImageProviderTypeEnum.ConfigurableHttp,
      deliveryMode: 'sync',
      baseUrl: 'https://example.com',
      apiKey: 'sk-test-secret',
      modelName: 'gpt-image-2',
      httpConfig: createHttpConfig(),
      enabled: true,
    });
    const job = await service.createImageJob({
      configId: config.id,
      prompt: 'test prompt',
      aspectRatio: '1:1',
      resolution: '1k',
      quantity: 1,
    });

    await jest.runAllTimersAsync();

    await expect(service.getImageJob(job.id)).resolves.toBeNull();
    await expect(service.listImageJobs()).resolves.toEqual([]);
  });

  it('deletes image jobs and their stored image files', async () => {
    const timestamp = new Date();

    await jobRepository.save({
      id: 'job-delete',
      configId: 'config-1',
      configName: 'custom',
      providerType: ImageProviderTypeEnum.OpenAICompatible,
      modelName: 'gpt-image-2',
      prompt: 'test prompt',
      aspectRatio: '1:1',
      resolution: '1k',
      quantity: 2,
      status: 'succeeded',
      imageUrl: '/api/images/generated/job-delete-1.png',
      imageUrls: [
        '/api/images/generated/job-delete-1.png',
        '/api/images/generated/job-delete-2.png',
      ],
      tokenUsage: 42,
      inputTokenUsage: 17,
      outputTokenUsage: 25,
      errorMessage: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    } as ImageJobEntity);

    await expect(service.deleteImageJob('job-delete')).resolves.toBe(true);
    await expect(jobRepository.findOneBy({ id: 'job-delete' })).resolves.toBeNull();
    expect(deletedImageUrls).toEqual([
      '/api/images/generated/job-delete-1.png',
      '/api/images/generated/job-delete-2.png',
    ]);
  });
});

function createHttpConfig(): ImageProviderHttpConfig {
  return {
    request: {
      method: 'POST',
      url: 'https://example.com/v1/images/generations',
      contentType: 'json',
      headers: {
        Authorization: 'Bearer {{apiKey}}',
      },
      body: {
        prompt: {
          path: 'prompt',
        },
        extra: [
          {
            path: 'model',
            value: 'gpt-image-2',
          },
        ],
      },
    },
    response: {
      images: {
        type: 'base64',
        dataPath: 'data[].b64_json',
      },
      usage: {
        totalTokensPath: 'usage.total_tokens',
        inputTokensPath: 'usage.prompt_tokens',
        outputTokensPath: 'usage.completion_tokens',
      },
    },
  };
}

/**
 * 创建用于单元测试的内存版 TypeORM Repository。
 */
function createMemoryRepository<T extends { id: string; createdAt: Date }>() {
  const items: T[] = [];

  return {
    count: jest.fn(async () => items.length),
    create: jest.fn((input: Partial<T>) => input as T),
    save: jest.fn(async (input: T | T[]): Promise<T | T[]> => {
      if (Array.isArray(input)) {
        input.forEach((item) => saveOne(items, item));
        return input;
      }

      saveOne(items, input);
      return input;
    }),
    find: jest.fn(async () =>
      [...items].sort(
        (left, right) =>
          right.createdAt.getTime() - left.createdAt.getTime(),
      ),
    ),
    findOneBy: jest.fn(async (where: Partial<T>) => {
      return (
        items.find((item) =>
          Object.entries(where).every(
            ([key, value]) =>
              item[key as keyof T] === value,
          ),
        ) ?? null
      );
    }),
    delete: jest.fn(async (where: Partial<T>) => {
      const index = items.findIndex((item) => item.id === where.id);

      if (index === -1) {
        return { affected: 0 };
      }

      items.splice(index, 1);
      return { affected: 1 };
    }),
    update: jest.fn(async (where: Partial<T>, input: Partial<T>) => {
      const item = items.find((entity) => entity.id === where.id);

      if (!item) {
        return { affected: 0 };
      }

      Object.assign(item, input);
      return { affected: 1 };
    }),
  } as unknown as Repository<T>;
}

/**
 * 将实体插入或覆盖到内存集合中。
 */
function saveOne<T extends { id: string }>(items: T[], entity: T) {
  const index = items.findIndex((item) => item.id === entity.id);

  if (index === -1) {
    items.push(entity);
    return;
  }

  items[index] = entity;
}
