import axios from 'axios';
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
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('passes auto size to OpenAI compatible providers', async () => {
    const dispatcher = new ImageProviderDispatcher();

    await dispatcher.generate({
      providerType: 'openai',
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
      providerType: 'google',
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
      providerType: 'image-youyu',
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
      providerType: 'image-youyu',
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
});
