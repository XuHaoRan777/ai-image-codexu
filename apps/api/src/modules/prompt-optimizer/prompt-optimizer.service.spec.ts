import type { Repository } from 'typeorm';
import { decryptSecret } from '../../common/utils/secretCrypto';
import { AssistantModelConfigEntity } from '../../entity/AssistantModelConfig';
import { PromptOptimizerService } from './prompt-optimizer.service';

describe('PromptOptimizerService', () => {
  let repository: Repository<AssistantModelConfigEntity>;
  let service: PromptOptimizerService;

  beforeEach(() => {
    repository = createAssistantConfigRepository();
    service = new PromptOptimizerService(repository);
  });

  it('creates a default assistant config', async () => {
    await expect(service.getAssistantConfig()).resolves.toMatchObject({
      mode: 'openai',
      baseUrl: '',
      modelName: '',
      enabled: false,
    });
  });

  it('updates assistant config and masks api key', async () => {
    const updated = await service.updateAssistantConfig({
      mode: 'claude',
      baseUrl: 'https://api.example.com',
      apiKey: 'sk-assistant-secret',
      modelName: 'claude-sonnet',
      enabled: true,
    });

    expect(updated.apiKeyMasked).toBe('sk-****cret');
    expect(updated.mode).toBe('claude');
    expect(updated.enabled).toBe(true);

    const stored = await repository.findOneBy({ id: 'default' });
    expect(stored?.apiKeyEncrypted).toBeDefined();
    expect(decryptSecret(stored?.apiKeyEncrypted)).toBe(
      'sk-assistant-secret',
    );

    await service.updateAssistantConfig({
      mode: 'claude',
      baseUrl: 'https://api.example.com',
      apiKey: '',
      modelName: 'claude-sonnet',
      enabled: false,
    });

    await expect(repository.findOneBy({ id: 'default' })).resolves.toMatchObject({
      apiKeyEncrypted: stored?.apiKeyEncrypted,
    });
  });

  it('optimizes prompt when assistant is enabled', async () => {
    await service.updateAssistantConfig({
      mode: 'openai',
      baseUrl: 'https://api.example.com',
      modelName: 'gpt',
      enabled: true,
    });

    const result = await service.optimizePrompt({ prompt: '  cat  ' });

    expect(result.originalPrompt).toBe('  cat  ');
    expect(result.optimizedPrompt).toContain('cat');
    expect(result.optimizedPrompt).toContain('画面要求');
  });
});

function createAssistantConfigRepository() {
  let item: AssistantModelConfigEntity | null = null;

  return {
    findOneBy: jest.fn(async (where: Partial<AssistantModelConfigEntity>) => {
      if (!item || item.id !== where.id) {
        return null;
      }

      return item;
    }),
    create: jest.fn(
      (input: Partial<AssistantModelConfigEntity>) =>
        input as AssistantModelConfigEntity,
    ),
    save: jest.fn(async (input: AssistantModelConfigEntity) => {
      item = input;
      return input;
    }),
  } as unknown as Repository<AssistantModelConfigEntity>;
}
