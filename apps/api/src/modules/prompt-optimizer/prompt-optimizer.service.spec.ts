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
    mockedAxios.get.mockReset();
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

  it('uses enabled OpenAI assistant config to generate image provider config', async () => {
    const generatedConfig = createAiGeneratedImageConfig();

    mockedAxios.get.mockResolvedValue({
      data: '<html><body>POST /v1/images/generations</body></html>',
    });
    mockedAxios.post.mockResolvedValue({
      data: {
        choices: [
          {
            message: {
              content: JSON.stringify(generatedConfig),
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

    const result = await service.generateImageProviderConfig({
      configName: 'Nano Banana',
      modelName: 'gemini-image',
      sourceUrl: 'https://docs.example.com/images',
    });

    expect(result).toEqual(generatedConfig);
    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://docs.example.com/images',
      expect.objectContaining({
        responseType: 'text',
      }),
    );
    const openAiPayload = mockedAxios.post.mock.calls[0]?.[1] as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(openAiPayload.messages[0]).toMatchObject({
      role: 'system',
      content: expect.stringContaining('生图 HTTP 模板配置生成器'),
    });
    expect(openAiPayload.messages[0].content).toContain(
      '基础生图参数必须尽量完整',
    );
    expect(openAiPayload.messages[0].content).toContain('OpenAI 风格基础参数');
    expect(openAiPayload.messages[0].content).toContain(
      'Google/Gemini 风格基础参数',
    );
    expect(openAiPayload.messages[0].content).toContain('参考图配置规则');
    expect(openAiPayload.messages[1].content).toContain(
      'POST /v1/images/generations',
    );
  });

  it('continues image provider config generation when document fetch fails', async () => {
    const generatedConfig = createAiGeneratedImageConfig();

    mockedAxios.get.mockRejectedValue(new Error('docs unavailable'));
    mockedAxios.post.mockResolvedValue({
      data: {
        choices: [
          {
            message: {
              content: JSON.stringify(generatedConfig),
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

    const result = await service.generateImageProviderConfig({
      sourceUrl: 'https://docs.example.com/unreachable',
    });

    expect(result).toEqual(generatedConfig);
    const openAiPayload = mockedAxios.post.mock.calls[0]?.[1] as {
      messages: Array<{ role: string; content: string }>;
    };

    expect(openAiPayload.messages[1].content).toContain(
      '文档地址：https://docs.example.com/unreachable',
    );
    expect(openAiPayload.messages[1].content).not.toContain('文档抓取内容');
  });

  it('rejects generated image provider config with hardcoded sensitive headers', async () => {
    const generatedConfig = createAiGeneratedImageConfig();

    (
      generatedConfig.httpConfig.request.headers as Record<string, string>
    ).Authorization = 'Bearer sk-hardcoded';
    mockedAxios.post.mockResolvedValue({
      data: {
        choices: [
          {
            message: {
              content: JSON.stringify(generatedConfig),
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

    await expect(
      service.generateImageProviderConfig({ sourceText: 'API docs' }),
    ).rejects.toThrow('AI 配置生成失败');
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

function createAiGeneratedImageConfig() {
  return {
    name: 'Nano Banana',
    providerType: 'configurable-http',
    deliveryMode: 'sync',
    baseUrl: '',
    generationPath: '',
    editPath: '',
    modelName: 'gemini-image',
    fieldMapping: {},
    fieldOverrides: {},
    pollingConfig: {},
    enabled: false,
    httpConfig: {
      request: {
        method: 'POST',
        url: 'https://api.example.com/v1beta/models/gemini-image:generateContent',
        contentType: 'json',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': '{{apiKey}}',
        },
        body: {
          prompt: {
            path: 'contents[0].parts[0].text',
          },
          aspectRatio: {
            path: 'generationConfig.imageConfig.aspectRatio',
            options: [
              {
                label: '1:1',
                value: '1:1',
              },
            ],
          },
          resolution: {
            path: 'generationConfig.imageConfig.imageSize',
            options: [
              {
                label: '1k',
                value: '1K',
              },
            ],
          },
          quantity: {
            enabled: false,
            path: 'candidateCount',
            min: 1,
            max: 3,
            defaultValue: 1,
          },
          referenceImages: {
            mode: 'none',
            maxCount: 16,
          },
          extra: [
            {
              path: 'generationConfig.responseModalities',
              value: ['IMAGE'],
            },
          ],
        },
      },
      response: {
        images: {
          type: 'base64',
          dataPath: 'candidates[].content.parts[].inlineData.data',
          mimeTypePath: 'candidates[].content.parts[].inlineData.mimeType',
        },
        usage: {
          totalTokensPath: 'usageMetadata.totalTokenCount',
        },
      },
    },
  };
}
