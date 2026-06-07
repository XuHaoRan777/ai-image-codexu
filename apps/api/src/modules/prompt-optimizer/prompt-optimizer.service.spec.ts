import axios from 'axios';
import type { Repository } from 'typeorm';
import { decryptSecret } from '../../common/utils/secretCrypto';
import { AssistantModelConfigEntity } from '../../entity/AssistantModelConfig';
import { PromptOptimizerService } from './prompt-optimizer.service';

jest.mock('axios');

const mockedAxios = jest.mocked(axios);

describe('PromptOptimizerService', () => {
  let repository: Repository<AssistantModelConfigEntity>;
  let service: PromptOptimizerService;

  beforeEach(() => {
    mockedAxios.post.mockReset();
    repository = createAssistantConfigRepository();
    service = new PromptOptimizerService(repository);
  });

  it('creates a default assistant config', async () => {
    await expect(service.getAssistantConfig()).resolves.toMatchObject({
      mode: 'openai',
      url: '',
      modelName: '',
      enabled: false,
    });
  });

  it('updates assistant config and masks api key', async () => {
    const updated = await service.updateAssistantConfig({
      mode: 'claude',
      url: 'https://api.example.com/v1/messages',
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
      url: 'https://api.example.com/v1/messages',
      apiKey: '',
      modelName: 'claude-sonnet',
      enabled: false,
    });

    await expect(repository.findOneBy({ id: 'default' })).resolves.toMatchObject({
      apiKeyEncrypted: stored?.apiKeyEncrypted,
    });
  });

  it('uses enabled OpenAI assistant config to optimize prompt', async () => {
    mockedAxios.post.mockResolvedValue({
      data: {
        choices: [
          {
            message: {
              content: 'optimized cat prompt',
            },
          },
        ],
      },
    });

    await service.updateAssistantConfig({
      mode: 'openai',
      url: 'https://api.example.com/v1/chat/completions',
      apiKey: 'sk-openai',
      modelName: 'gpt',
      enabled: true,
    });

    const result = await service.optimizePrompt({ prompt: '  cat  ' });

    expect(result.originalPrompt).toBe('  cat  ');
    expect(result.optimizedPrompt).toBe('optimized cat prompt');
    const openAiPayload = mockedAxios.post.mock.calls[0]?.[1] as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(openAiPayload.messages[0]).toMatchObject({
      role: 'system',
      content: expect.stringContaining('必须以用户原意为最高优先级'),
    });
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api.example.com/v1/chat/completions',
      expect.objectContaining({
        model: 'gpt',
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: 'cat',
          }),
        ]),
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-openai',
        }),
      }),
    );
  });

  it('rejects enabled assistant config without request url', async () => {
    await service.updateAssistantConfig({
      mode: 'openai',
      url: '',
      apiKey: 'sk-openai',
      modelName: 'gpt',
      enabled: true,
    });

    await expect(service.optimizePrompt({ prompt: 'cat' })).rejects.toThrow(
      '辅助模型缺少请求地址',
    );
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('uses enabled Claude assistant config to optimize prompt', async () => {
    mockedAxios.post.mockResolvedValue({
      data: {
        content: [
          {
            type: 'text',
            text: 'optimized cat with claude',
          },
        ],
      },
    });

    await service.updateAssistantConfig({
      mode: 'claude',
      url: 'https://claude.example.com/v1/messages',
      apiKey: 'sk-claude',
      modelName: 'claude-sonnet',
      enabled: true,
    });

    const result = await service.optimizePrompt({ prompt: 'cat' });

    expect(result.optimizedPrompt).toBe('optimized cat with claude');
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://claude.example.com/v1/messages',
      expect.objectContaining({
        model: 'claude-sonnet',
        messages: [
          {
            role: 'user',
            content: 'cat',
          },
        ],
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-api-key': 'sk-claude',
          'anthropic-version': '2023-06-01',
        }),
      }),
    );
  });

  it('uses OpenAI vision message format to recognize an image', async () => {
    mockedAxios.post.mockResolvedValue({
      data: {
        choices: [
          {
            message: {
              content: 'image analysis result',
            },
          },
        ],
      },
    });

    await service.updateAssistantConfig({
      mode: 'openai',
      url: 'https://api.example.com/v1/chat/completions',
      apiKey: 'sk-openai',
      modelName: 'gpt-vision',
      enabled: true,
    });

    const result = await service.recognizeImage({
      imageDataUrl: 'data:image/png;base64,aW1hZ2U=',
      prompt: '识别图片',
    });

    expect(result.result).toBe('image analysis result');
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api.example.com/v1/chat/completions',
      expect.objectContaining({
        model: 'gpt-vision',
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: [
              {
                type: 'text',
                text: '识别图片',
              },
              {
                type: 'image_url',
                image_url: {
                  url: 'data:image/png;base64,aW1hZ2U=',
                },
              },
            ],
          }),
        ]),
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-openai',
        }),
      }),
    );
  });

  it('uses Claude image content format to recognize an image', async () => {
    mockedAxios.post.mockResolvedValue({
      data: {
        content: [
          {
            type: 'text',
            text: 'claude image analysis',
          },
        ],
      },
    });

    await service.updateAssistantConfig({
      mode: 'claude',
      url: 'https://claude.example.com/v1/messages',
      apiKey: 'sk-claude',
      modelName: 'claude-vision',
      enabled: true,
    });

    const result = await service.recognizeImage({
      imageDataUrl: 'data:image/jpeg;base64,aW1hZ2U=',
      prompt: '分析商品',
    });

    expect(result.result).toBe('claude image analysis');
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://claude.example.com/v1/messages',
      expect.objectContaining({
        model: 'claude-vision',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: '分析商品',
              },
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/jpeg',
                  data: 'aW1hZ2U=',
                },
              },
            ],
          },
        ],
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-api-key': 'sk-claude',
        }),
      }),
    );
  });
});

/**
 * 创建用于单元测试的内存版辅助模型配置仓储。
 */
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
