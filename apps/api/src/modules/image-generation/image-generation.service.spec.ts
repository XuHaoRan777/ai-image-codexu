import type { Repository } from 'typeorm';
import { ImageProviderTypeEnum } from '@ai-image-codexu/shared';
import { decryptSecret } from '../../common/utils/secretCrypto';
import { ImageJobEntity } from '../../entity/ImageJob';
import { ImageModelConfigEntity } from '../../entity/ImageModelConfig';
import { ImageStorageService } from '../image-processing/image-storage.service';
import { ImageProviderDispatcher } from './image-generation.providers';
import { ImageGenerationService } from './image-generation.service';

describe('ImageGenerationService', () => {
  let modelRepository: Repository<ImageModelConfigEntity>;
  let jobRepository: Repository<ImageJobEntity>;
  let dispatcher: ImageProviderDispatcher;
  let service: ImageGenerationService;
  let deletedImageUrls: string[];

  beforeEach(() => {
    jest.useFakeTimers();
    modelRepository = createMemoryRepository<ImageModelConfigEntity>();
    jobRepository = createMemoryRepository<ImageJobEntity>();
    deletedImageUrls = [];
    dispatcher = {
      generate: jest.fn(async () => [
        {
          content: Buffer.from('image'),
          mimeType: 'image/png',
        },
      ]),
    } as unknown as ImageProviderDispatcher;
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
      providerType: ImageProviderTypeEnum.OneTopAI,
      apiKey: 'sk-test-secret',
      modelNameOverride: 'gpt-image-2',
      enabled: true,
    });

    expect(created.providerType).toBe('onetopai');
    expect(created.apiKeyMasked).toBe('sk-****cret');
    const stored = await modelRepository.findOneBy({ id: created.id });
    expect(stored?.apiKeyEncrypted).toBeDefined();
    expect(stored?.apiKeyEncrypted).not.toContain('sk-test-secret');
    expect(decryptSecret(stored?.apiKeyEncrypted)).toBe('sk-test-secret');

    const updated = await service.updateImageModelConfig(created.id, {
      apiKey: '',
      enabled: false,
      modelNameOverride: '',
    });

    expect(updated?.enabled).toBe(false);
    expect(updated?.modelNameOverride).toBeUndefined();
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
      providerType: ImageProviderTypeEnum.OpenAI,
      apiKey: 'sk-test-secret',
      modelNameOverride: 'gpt-image-2',
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

  it('creates image jobs with selected config', async () => {
    const config = await service.createImageModelConfig({
      name: 'custom',
      providerType: ImageProviderTypeEnum.OneTopAI,
      apiKey: 'sk-test-secret',
      modelNameOverride: 'gpt-image-2',
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
    expect(job.providerType).toBe('onetopai');
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
    await expect(service.listImageJobs()).resolves.toEqual([
      expect.objectContaining({
        id: job.id,
        status: 'succeeded',
        imageUrl: `/api/images/generated/${job.id}-1.png`,
      }),
    ]);
    expect(dispatcher.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        providerType: ImageProviderTypeEnum.OneTopAI,
        modelName: 'gpt-image-2',
      }),
    );
  });

  it('records AiCodeWith beta model for 1k single image jobs', async () => {
    const config = await service.createImageModelConfig({
      name: 'aicodewith',
      providerType: ImageProviderTypeEnum.AiCodeWith,
      apiKey: 'sk-test-secret',
      modelNameOverride: 'ignored-model',
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

    expect(dispatcher.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        providerType: ImageProviderTypeEnum.AiCodeWith,
        modelName: 'gpt-image-2-beta',
      }),
    );
  });

  it('records AiCodeWith gpt-image-2 model for non-beta image jobs', async () => {
    const config = await service.createImageModelConfig({
      name: 'aicodewith',
      providerType: ImageProviderTypeEnum.AiCodeWith,
      apiKey: 'sk-test-secret',
      modelNameOverride: 'ignored-model',
      enabled: true,
    });
    const job = await service.createImageJob({
      configId: config.id,
      prompt: 'test prompt',
      aspectRatio: '16:9',
      resolution: '2k',
      quantity: 2,
    });

    expect(job.modelName).toBe('gpt-image-2');

    await jest.runAllTimersAsync();

    expect(dispatcher.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        providerType: ImageProviderTypeEnum.AiCodeWith,
        modelName: 'gpt-image-2',
      }),
    );
  });

  it('removes image job records when provider throws', async () => {
    jest
      .spyOn(dispatcher, 'generate')
      .mockRejectedValueOnce(new Error('provider failed'));
    const config = await service.createImageModelConfig({
      name: 'custom',
      providerType: ImageProviderTypeEnum.OpenAI,
      apiKey: 'sk-test-secret',
      modelNameOverride: 'gpt-image-2',
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
      providerType: ImageProviderTypeEnum.OpenAI,
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
