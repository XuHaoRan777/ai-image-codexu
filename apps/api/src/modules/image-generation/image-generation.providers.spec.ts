import axios, { AxiosError } from 'axios';
import { ImageProviderTypeEnum } from '@ai-image-codexu/shared';
import { Logger } from '@nestjs/common';
import { ImageProviderDispatcher } from './image-generation.providers';

jest.mock('axios');

const mockedAxios = jest.mocked(axios);

describe('ImageProviderDispatcher', () => {
  beforeEach(() => {
    mockedAxios.post.mockResolvedValue({
      data: {
        data: [
          {
            b64_json: Buffer.from('image').toString('base64'),
          },
        ],
      },
    });
    mockedAxios.get.mockResolvedValue({
      data: Buffer.from('remote-image'),
      headers: {
        'content-type': 'image/png',
      },
    });
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('builds OpenAI-compatible requests with mapped field names', async () => {
    const dispatcher = new ImageProviderDispatcher();

    await dispatcher.generate({
      providerType: ImageProviderTypeEnum.OpenAICompatible,
      deliveryMode: 'sync',
      apiKey: 'sk-test',
      baseUrl: 'https://example.com',
      generationPath: '/v1/images/generations',
      modelName: 'gpt-image-2',
      prompt: 'test prompt',
      aspectRatio: 'auto',
      resolution: '1k',
      quantity: 1,
      fieldMapping: {
        quantity: 'count',
        responseFormat: 'format',
      },
    });

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://example.com/v1/images/generations',
      expect.objectContaining({
        model: 'gpt-image-2',
        prompt: 'test prompt',
        count: 1,
        size: 'auto',
        quality: 'medium',
        format: 'b64_json',
      }),
      expect.any(Object),
    );
  });

  it('builds configured HTTP JSON requests with body parameter config and reference images', async () => {
    const loggerSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    mimeType: 'image/png',
                    data: Buffer.from('image').toString('base64'),
                  },
                },
              ],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 17,
          candidatesTokenCount: 25,
        },
      },
    });
    const dispatcher = new ImageProviderDispatcher();
    const referenceImage = `data:image/jpeg;base64,${Buffer.from(
      'reference-image',
    ).toString('base64')}`;

    const result = await dispatcher.generateConfiguredHttp({
      deliveryMode: 'sync',
      apiKey: 'google-key',
      httpConfig: {
        request: {
          method: 'POST',
          url: 'https://api.apiyi.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent',
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
              options: [{ label: 'auto', value: null }],
            },
            resolution: {
              path: 'generationConfig.imageConfig.imageSize',
              options: [{ label: '1k', value: '1K' }],
            },
            quantity: { path: 'candidateCount', enabled: false },
            referenceImages: {
              mode: 'inlineBase64',
              maxCount: 16,
              path: 'contents[0].parts[]',
              template: {
                inlineData: {
                  mimeType: '{{mimeType}}',
                  data: '{{base64}}',
                },
              },
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
            mimeTypePath:
              'candidates[].content.parts[].inlineData.mimeType',
          },
          usage: {
            inputTokensPath: 'usageMetadata.promptTokenCount',
            outputTokensPath: 'usageMetadata.candidatesTokenCount',
          },
        },
      },
      prompt: 'test prompt',
      aspectRatio: 'auto',
      resolution: '1k',
      quantity: 1,
      referenceImages: [referenceImage],
    });

    expect(result).toEqual({
      images: [
        {
          content: Buffer.from('image'),
          mimeType: 'image/png',
        },
      ],
      tokenUsage: 42,
      inputTokenUsage: 17,
      outputTokenUsage: 25,
    });
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api.apiyi.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent',
      expect.objectContaining({
        contents: [
          {
            parts: [
              { text: 'test prompt' },
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: Buffer.from('reference-image').toString('base64'),
                },
              },
            ],
          },
        ],
        generationConfig: expect.objectContaining({
          responseModalities: ['IMAGE'],
          imageConfig: expect.objectContaining({
            imageSize: '1K',
          }),
        }),
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-goog-api-key': 'google-key',
        }),
      }),
    );
    const sentBody = mockedAxios.post.mock.calls[0]?.[1] as {
      candidateCount?: number;
      generationConfig?: { imageConfig?: { aspectRatio?: string } };
    };
    expect(sentBody.candidateCount).toBeUndefined();
    expect(sentBody.generationConfig?.imageConfig?.aspectRatio).toBeUndefined();
    const logPayload = JSON.parse(loggerSpy.mock.calls[0]?.[0] as string);
    expect(logPayload.headers['x-goog-api-key']).toBe('[redacted]');
    expect(JSON.stringify(logPayload)).not.toContain('google-key');
    loggerSpy.mockRestore();
  });

  it('polls configured HTTP tasks and downloads URL results', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        id: 'task-1',
      },
    });
    mockedAxios.get
      .mockResolvedValueOnce({
        data: {
          status: 'completed',
          result_data: [{ url: 'https://example.com/image.png' }],
        },
      })
      .mockResolvedValueOnce({
        data: Buffer.from('remote-image'),
        headers: {
          'content-type': 'image/png',
        },
      });
    const dispatcher = new ImageProviderDispatcher();

    const result = await dispatcher.generateConfiguredHttp({
      deliveryMode: 'polling',
      apiKey: 'sk-test',
      httpConfig: {
        request: {
          method: 'POST',
          url: 'https://api.aicodewith.com/v1/images/generations',
          contentType: 'json',
          headers: {
            Authorization: 'Bearer {{apiKey}}',
          },
          body: {
            prompt: {
              path: 'prompt',
            },
          },
        },
        response: {
          images: {
            type: 'url',
            urlPath: 'data[].url',
          },
        },
        polling: {
          request: {
            method: 'GET',
            url: 'https://api.aicodewith.com/v1/tasks/{{taskId}}',
            contentType: 'json',
            headers: {
              Authorization: 'Bearer {{apiKey}}',
            },
          },
          taskIdPath: 'id',
          statusPath: 'status',
          successValue: 'completed',
          failureValue: 'failed',
          intervalMs: 1000,
          timeoutMs: 10000,
          response: {
            images: {
              type: 'url',
              urlPath: 'result_data[].url',
            },
          },
        },
      },
      prompt: 'test prompt',
      aspectRatio: '1:1',
      resolution: '1k',
      quantity: 1,
    });

    expect(result.images).toEqual([
      {
        content: Buffer.from('remote-image'),
        mimeType: 'image/png',
      },
    ]);
    expect(mockedAxios.get).toHaveBeenNthCalledWith(
      1,
      'https://api.aicodewith.com/v1/tasks/task-1',
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer sk-test',
        },
      }),
    );
  });

  it('omits disabled OpenAI-compatible fields', async () => {
    const dispatcher = new ImageProviderDispatcher();

    await dispatcher.generate({
      providerType: ImageProviderTypeEnum.OpenAICompatible,
      deliveryMode: 'sync',
      apiKey: 'sk-test',
      baseUrl: 'https://example.com',
      modelName: 'gpt-image-2-beta',
      prompt: 'test prompt',
      aspectRatio: '1:1',
      resolution: '1k',
      quantity: 1,
      fieldOverrides: {
        quantity: false,
        quality: false,
        responseFormat: false,
      },
    });

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://example.com/v1/images/generations',
      expect.not.objectContaining({
        n: expect.anything(),
        quality: expect.anything(),
        response_format: expect.anything(),
      }),
      expect.any(Object),
    );
  });

  it('omits Google imageConfig aspect ratio when aspect ratio is auto', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    mimeType: 'image/png',
                    data: Buffer.from('image').toString('base64'),
                  },
                },
              ],
            },
          },
        ],
      },
    });
    const dispatcher = new ImageProviderDispatcher();

    // Google 模式的 baseUrl 已是完整端点(含模型名与 :generateContent),不再传/拼 modelName
    await dispatcher.generate({
      providerType: ImageProviderTypeEnum.GoogleCompatible,
      deliveryMode: 'sync',
      apiKey: 'google-key',
      baseUrl:
        'https://generativelanguage.googleapis.com/v1/models/gemini-3.1-flash-image:generateContent',
      prompt: 'test prompt',
      aspectRatio: 'auto',
      resolution: '1k',
      quantity: 1,
    });

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1/models/gemini-3.1-flash-image:generateContent',
      expect.objectContaining({
        generationConfig: expect.objectContaining({
          imageConfig: expect.not.objectContaining({
            aspectRatio: expect.anything(),
          }),
        }),
      }),
      expect.any(Object),
    );
  });

  it('polls OpenAI-compatible async tasks and downloads result urls', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        id: 'task-1',
      },
    });
    mockedAxios.get
      .mockResolvedValueOnce({
        data: {
          status: 'completed',
          result_data: [{ url: 'https://example.com/image.png' }],
        },
      })
      .mockResolvedValueOnce({
        data: Buffer.from('remote-image'),
        headers: {
          'content-type': 'image/png',
        },
      });
    const dispatcher = new ImageProviderDispatcher();

    const images = await dispatcher.generate({
      providerType: ImageProviderTypeEnum.OpenAICompatible,
      deliveryMode: 'polling',
      apiKey: 'sk-test',
      baseUrl: 'https://api.aicodewith.com',
      generationPath: '/v1/images/generations',
      modelName: 'gpt-image-2-beta',
      prompt: 'test prompt',
      aspectRatio: '1:1',
      resolution: '1k',
      quantity: 1,
      fieldOverrides: {
        quantity: false,
        quality: false,
        responseFormat: false,
      },
      pollingConfig: {
        taskIdPath: 'id',
        pollPathTemplate: '/v1/tasks/{taskId}',
        statusPath: 'status',
        successStatusValue: 'completed',
        failureStatusValue: 'failed',
        resultUrlsPath: 'result_data[].url',
        intervalMs: 1000,
        timeoutMs: 10000,
      },
    });

    expect(images).toEqual([
      {
        content: Buffer.from('remote-image'),
        mimeType: 'image/png',
      },
    ]);
    expect(mockedAxios.get).toHaveBeenNthCalledWith(
      1,
      'https://api.aicodewith.com/v1/tasks/task-1',
      expect.objectContaining({
        timeout: 300_000,
      }),
    );
    expect(mockedAxios.get).toHaveBeenNthCalledWith(
      2,
      'https://example.com/image.png',
      {
        responseType: 'arraybuffer',
      },
    );
  });

  it('uses five minute timeout and logs provider errors as formatted JSON', async () => {
    const loggerSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const providerError = new AxiosError('Request failed with status code 400');
    Object.assign(providerError, {
      response: {
        status: 400,
        data: JSON.stringify({
          error: {
            message: '上游生图网关当前不可用，本次未扣费',
            type: 'invalid_request_error',
          },
        }),
      },
    });
    mockedAxios.post.mockRejectedValueOnce(providerError);
    const dispatcher = new ImageProviderDispatcher();

    await expect(
      dispatcher.generate({
        providerType: ImageProviderTypeEnum.OpenAICompatible,
        deliveryMode: 'sync',
        apiKey: 'sk-test',
        baseUrl: 'https://example.com',
        modelName: 'gpt-image-2',
        prompt: 'test prompt',
        aspectRatio: '1:1',
        resolution: '1k',
        quantity: 1,
      }),
    ).rejects.toThrow('上游生图网关当前不可用，本次未扣费');

    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.objectContaining({
        timeout: 300_000,
      }),
    );
    expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('\n'));
    expect(JSON.parse(loggerSpy.mock.calls[0]?.[0] as string)).toEqual({
      message: 'Provider image response',
      status: 400,
      response: {
        error: {
          message: '上游生图网关当前不可用，本次未扣费',
          type: 'invalid_request_error',
        },
      },
    });

    loggerSpy.mockRestore();
  });
});
