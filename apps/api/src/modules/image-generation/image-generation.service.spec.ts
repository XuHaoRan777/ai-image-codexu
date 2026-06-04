import { ImageGenerationService } from './image-generation.service';
import { ImageStorageService } from '../image-processing/image-storage.service';

describe('ImageGenerationService', () => {
  let service: ImageGenerationService;

  beforeEach(() => {
    jest.useFakeTimers();
    service = new ImageGenerationService({
      toPublicUrl: (relativePath: string) => `/api/images/${relativePath}`,
    } as ImageStorageService);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('lists default image model configs', () => {
    expect(service.listImageModelConfigs()).toHaveLength(2);
  });

  it('creates image jobs with selected config', () => {
    const [config] = service.listImageModelConfigs();
    const job = service.createImageJob({
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
