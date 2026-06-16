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

  it('passes auto size to OpenAI provider', async () => {
    const dispatcher = new ImageProviderDispatcher();

    await dispatcher.generate({
      providerType: ImageProviderTypeEnum.OpenAI,
      apiKey: 'sk-test',
      modelName: 'gpt-image-2',
      prompt: 'test prompt',
      aspectRatio: 'auto',
      resolution: '1k',
      quantity: 1,
    });

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api.openai.com/v1/images/generations',
      expect.objectContaining({
        size: 'auto',
      }),
      expect.any(Object),
    );
  });

  it('uses OneTopAI fixed images endpoint with its own request body', async () => {
    const dispatcher = new ImageProviderDispatcher();

    await dispatcher.generate({
      providerType: ImageProviderTypeEnum.OneTopAI,
      apiKey: 'onetopai-key',
      modelName: 'gpt-image-2',
      prompt: 'test prompt',
      aspectRatio: '1:1',
      resolution: '1k',
      quantity: 3,
    });

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://www.onetopai.asia/v1/images/generations',
      expect.objectContaining({
        model: 'gpt-image-2',
        prompt: 'test prompt',
        n: 3,
        size: '1024x1024',
      }),
      expect.any(Object),
    );
  });

  it('omits Google imageConfig when aspect ratio is auto', async () => {
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

    await dispatcher.generate({
      providerType: ImageProviderTypeEnum.Google,
      apiKey: 'google-key',
      modelName: 'gemini-3.1-flash-image',
      prompt: 'test prompt',
      aspectRatio: 'auto',
      resolution: '1k',
      quantity: 1,
    });

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1/models/gemini-3.1-flash-image:generateContent',
      expect.objectContaining({
        generationConfig: expect.not.objectContaining({
          imageConfig: expect.anything(),
        }),
      }),
      expect.any(Object),
    );
  });

  it('does not send model to image-youyu text-to-image requests', async () => {
    const dispatcher = new ImageProviderDispatcher();

    await dispatcher.generate({
      providerType: ImageProviderTypeEnum.ImageYouyu,
      apiKey: 'youyu-key',
      modelName: 'ignored-model',
      prompt: 'test prompt',
      aspectRatio: '16:9',
      resolution: '4k',
      quantity: 2,
    });

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://image.youyu.help/v1/images/generations',
      expect.objectContaining({
        prompt: 'test prompt',
        quality: '2k',
        size: '1536x1024',
        output_format: 'png',
        n: 2,
      }),
      expect.any(Object),
    );
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.not.objectContaining({
        model: expect.anything(),
      }),
      expect.any(Object),
    );
  });

  it('uses image-youyu edits endpoint for image-to-image requests', async () => {
    const dispatcher = new ImageProviderDispatcher();

    await dispatcher.generate({
      providerType: ImageProviderTypeEnum.ImageYouyu,
      apiKey: 'youyu-key',
      modelName: 'ignored-model',
      prompt: 'test prompt',
      aspectRatio: '9:16',
      resolution: '1k',
      quantity: 1,
      referenceImages: [
        `data:image/png;base64,${Buffer.from('reference').toString('base64')}`,
      ],
    });

    const [, body] = mockedAxios.post.mock.calls[0];

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://image.youyu.help/v1/images/edits',
      expect.any(FormData),
      expect.any(Object),
    );
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).has('model')).toBe(false);
    expect((body as FormData).get('prompt')).toBe('test prompt');
    expect((body as FormData).get('quality')).toBe('1k');
    expect((body as FormData).get('size')).toBe('1024x1536');
    expect((body as FormData).get('output_format')).toBe('png');
  });

  it('uses AiCodeWith beta model for 1k single image and omits fixed beta params', async () => {
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

    await dispatcher.generate({
      providerType: ImageProviderTypeEnum.AiCodeWith,
      apiKey: 'aicodewith-key',
      modelName: 'ignored-model',
      prompt: 'test prompt',
      aspectRatio: '1:1',
      resolution: '1k',
      quantity: 1,
    });

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api.aicodewith.com/v1/images/generations',
      {
        model: 'gpt-image-2-beta',
        prompt: 'test prompt',
        size: '1:1',
      },
      expect.any(Object),
    );
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.not.objectContaining({
        n: expect.anything(),
        quality: expect.anything(),
        resolution: expect.anything(),
      }),
      expect.any(Object),
    );
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

  it('uses AiCodeWith gpt-image-2 model with full params for non-beta requests', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        id: 'task-2',
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

    await dispatcher.generate({
      providerType: ImageProviderTypeEnum.AiCodeWith,
      apiKey: 'aicodewith-key',
      modelName: 'ignored-model',
      prompt: 'test prompt',
      aspectRatio: '16:9',
      resolution: '2k',
      quantity: 2,
    });

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api.aicodewith.com/v1/images/generations',
      {
        model: 'gpt-image-2',
        prompt: 'test prompt',
        size: '16:9',
        resolution: '2K',
        n: 2,
        quality: 'high',
      },
      expect.any(Object),
    );
  });

  it('rejects AiCodeWith local reference images before sending base64 to provider', async () => {
    const dispatcher = new ImageProviderDispatcher();

    await expect(
      dispatcher.generate({
        providerType: ImageProviderTypeEnum.AiCodeWith,
        apiKey: 'aicodewith-key',
        modelName: 'ignored-model',
        prompt: 'test prompt',
        aspectRatio: '1:1',
        resolution: '1k',
        quantity: 1,
        referenceImages: [
          `data:image/png;base64,${Buffer.from('reference').toString('base64')}`,
        ],
      }),
    ).rejects.toThrow('AiCodeWith 图生图需要公网可访问 image_urls');

    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('logs AiCodeWith failed task response as formatted provider payload', async () => {
    const loggerSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        id: 'task-failed',
      },
    });
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        status: 'failed',
        error: 'channel unavailable',
      },
    });
    const dispatcher = new ImageProviderDispatcher();

    await expect(
      dispatcher.generate({
        providerType: ImageProviderTypeEnum.AiCodeWith,
        apiKey: 'aicodewith-key',
        modelName: 'ignored-model',
        prompt: 'test prompt',
        aspectRatio: '1:1',
        resolution: '1k',
        quantity: 1,
      }),
    ).rejects.toThrow('channel unavailable');

    expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('\n'));
    expect(JSON.parse(loggerSpy.mock.calls[0]?.[0] as string)).toEqual({
      message: 'Provider image response',
      response: {
        status: 'failed',
        error: 'channel unavailable',
      },
    });

    loggerSpy.mockRestore();
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
        providerType: ImageProviderTypeEnum.ImageYouyu,
        apiKey: 'youyu-key',
        modelName: 'ignored-model',
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

    const loggedPayload = JSON.parse(
      loggerSpy.mock.calls[0]?.[0] as string,
    ) as {
      message: string;
      status: number;
      response: { error: { message: string; type: string } };
    };

    expect(loggedPayload).toEqual({
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
