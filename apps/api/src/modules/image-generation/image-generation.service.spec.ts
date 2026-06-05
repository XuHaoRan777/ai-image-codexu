import type { Repository } from 'typeorm';
import { decryptSecret } from '../../common/utils/secretCrypto';
import { ImageModelConfigEntity } from '../../entity/ImageModelConfig';
import { ImageStorageService } from '../image-processing/image-storage.service';
import { ImageGenerationService } from './image-generation.service';

describe('ImageGenerationService', () => {
  let repository: Repository<ImageModelConfigEntity>;
  let service: ImageGenerationService;

  beforeEach(() => {
    jest.useFakeTimers();
    repository = createImageModelConfigRepository();
    service = new ImageGenerationService(repository, {
        toPublicUrl: (relativePath: string) => `/api/images/${relativePath}`,
      } as ImageStorageService);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('lists persisted image model configs without test seeds', async () => {
    await expect(service.listImageModelConfigs()).resolves.toHaveLength(0);
  });

  it('creates and updates image model configs', async () => {
    const created = await service.createImageModelConfig({
      name: 'custom',
      modelType: 'gpt-image-2',
      baseUrl: 'https://api.example.com/v1/images',
      apiKey: 'sk-test-secret',
      modelNameOverride: 'gpt-image-2',
      enabled: true,
    });

    expect(created.apiKeyMasked).toBe('sk-****cret');
    const stored = await repository.findOneBy({ id: created.id });
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
    await expect(repository.findOneBy({ id: created.id })).resolves.toMatchObject({
      apiKeyEncrypted: stored?.apiKeyEncrypted,
    });
  });

  it('updates image model config enabled state only', async () => {
    const created = await service.createImageModelConfig({
      name: 'custom',
      modelType: 'gpt-image-2',
      baseUrl: 'https://api.example.com/v1/images',
      apiKey: 'sk-test-secret',
      modelNameOverride: 'gpt-image-2',
      enabled: true,
    });
    const storedBefore = await repository.findOneBy({ id: created.id });
    const updated = await service.updateImageModelConfigEnabled(created.id, {
      enabled: false,
    });

    expect(updated?.enabled).toBe(false);
    expect(updated?.name).toBe(created.name);
    expect(updated?.apiKeyMasked).toBe(created.apiKeyMasked);
    await expect(repository.findOneBy({ id: created.id })).resolves.toMatchObject({
      apiKeyEncrypted: storedBefore?.apiKeyEncrypted,
      enabled: false,
    });
  });

  it('creates image jobs with selected config', async () => {
    const config = await service.createImageModelConfig({
      name: 'custom',
      modelType: 'gpt-image-2',
      baseUrl: 'https://api.example.com/v1/images',
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

    expect(job.status).toBe('queued');
    expect(job.configId).toBe(config.id);
    expect(job.resolution).toBe('1k');
    expect(job.quantity).toBe(1);
  });
});

function createImageModelConfigRepository() {
  const items: ImageModelConfigEntity[] = [];

  return {
    count: jest.fn(async () => items.length),
    create: jest.fn(
      (input: Partial<ImageModelConfigEntity>) =>
        input as ImageModelConfigEntity,
    ),
    save: jest.fn(
      async (
        input: ImageModelConfigEntity | ImageModelConfigEntity[],
      ): Promise<ImageModelConfigEntity | ImageModelConfigEntity[]> => {
        if (Array.isArray(input)) {
          input.forEach((item) => saveOne(items, item));
          return input;
        }

        saveOne(items, input);
        return input;
      },
    ),
    find: jest.fn(async () =>
      [...items].sort(
        (left, right) =>
          right.createdAt.getTime() - left.createdAt.getTime(),
      ),
    ),
    findOneBy: jest.fn(async (where: Partial<ImageModelConfigEntity>) => {
      return (
        items.find((item) =>
          Object.entries(where).every(
            ([key, value]) =>
              item[key as keyof ImageModelConfigEntity] === value,
          ),
        ) ?? null
      );
    }),
    delete: jest.fn(async (where: Partial<ImageModelConfigEntity>) => {
      const index = items.findIndex((item) => item.id === where.id);

      if (index === -1) {
        return { affected: 0 };
      }

      items.splice(index, 1);
      return { affected: 1 };
    }),
  } as unknown as Repository<ImageModelConfigEntity>;
}

function saveOne(
  items: ImageModelConfigEntity[],
  entity: ImageModelConfigEntity,
) {
  const index = items.findIndex((item) => item.id === entity.id);

  if (index === -1) {
    items.push(entity);
    return;
  }

  items[index] = entity;
}
