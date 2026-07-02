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
