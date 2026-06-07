import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type {
  AssistantModelConfig,
  ImageRecognitionRequest,
  ImageRecognitionResponse,
  PromptOptimizeRequest,
  PromptOptimizeResponse,
  UpdateAssistantModelConfigInput,
} from '@ai-image-codexu/shared';
import axios, { AxiosError } from 'axios';
import { Repository } from 'typeorm';
import { maskSecret } from '../../common/utils/maskSecret';
import { decryptSecret, encryptSecret } from '../../common/utils/secretCrypto';
import { AssistantModelConfigEntity } from '../../entity/AssistantModelConfig';

const assistantConfigId = 'default';
const assistantRequestTimeoutMs = 120_000;
const promptOptimizerSystemPrompt = [
  '你是一个 AI 生图提示词优化器，目标是把用户原始提示词改写成更清晰、可执行、适合图像生成模型理解的版本。',
  '必须以用户原意为最高优先级：保留主体、动作、场景、风格、情绪、构图意图和任何明确限制；不要改变主题、身份、数量、时代、关系、视角或故事含义。',
  '可以在不违背原意的前提下补充画面细节，包括主体外观、环境、构图、镜头焦段、景别、光线、色彩、材质、质感、画面层次、风格化方向和质量描述。',
  '如果用户描述很短，只做合理的视觉扩写；不要主动加入用户没有暗示的具体品牌、人物、文字、Logo、地点、暴力、色情、政治内容或复杂剧情。',
  '将含糊表达转为具体可视化描述，去除相互冲突或不适合生图的表述；保留用户明确要求的语言、文字内容和比例、尺寸、数量等参数。',
  '必要时加入简短负面约束，如避免水印、乱码文字、畸形结构、低清晰度、过度锐化、额外肢体、主体偏离。',
  '只输出优化后的提示词正文，不要解释、不要分点、不要添加标题、不要包裹引号。',
].join('\n');
const imageRecognitionSystemPrompt = [
  '你是一个严谨的图片理解助手，必须基于图片中真实可见的信息回答用户问题。',
  '优先识别图片中的主体、物品、场景、文字、空间关系、颜色、材质、风格和可能用途。',
  '如果用户要求电商文案、OCR、属性分析或百科解释，请按用户要求的格式输出。',
  '不要编造图片中不可见或无法确认的信息；无法判断时明确说明“不确定”或“图片中无法确认”。',
  '默认使用中文输出，结构清晰，内容直接，不要复述系统规则。',
].join('\n');

type OpenAiChatResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

type ClaudeMessageResponse = {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
};

type AssistantRuntime = {
  apiKey: string;
  url: string;
};

type ParsedImageDataUrl = {
  base64Data: string;
  dataUrl: string;
  mimeType: string;
};

@Injectable()
export class PromptOptimizerService {
  /**
   * 注入辅助模型配置仓储。
   */
  constructor(
    @InjectRepository(AssistantModelConfigEntity)
    private readonly assistantConfigRepository: Repository<AssistantModelConfigEntity>,
  ) {}

  /**
   * 获取辅助模型配置，缺失时自动创建默认配置。
   */
  async getAssistantConfig() {
    return this.toAssistantModelConfig(await this.ensureAssistantConfig());
  }

  /**
   * 更新辅助模型配置，并在提供新密钥时加密保存。
   */
  async updateAssistantConfig(input: UpdateAssistantModelConfigInput) {
    const existing = await this.ensureAssistantConfig();

    existing.mode = input.mode;
    existing.url = input.url;
    if (input.apiKey !== undefined && input.apiKey.trim() !== '') {
      const apiKey = input.apiKey.trim();
      existing.apiKeyMasked = maskSecret(apiKey) ?? null;
      existing.apiKeyEncrypted = encryptSecret(apiKey);
    }
    existing.modelName = input.modelName;
    existing.enabled = input.enabled;
    existing.updatedAt = new Date();

    const saved = await this.assistantConfigRepository.save(existing);

    return this.toAssistantModelConfig(saved);
  }

  /**
   * 使用已启用的辅助模型配置调用第三方接口优化提示词。
   */
  async optimizePrompt(
    input: PromptOptimizeRequest,
  ): Promise<PromptOptimizeResponse> {
    const assistantConfig = await this.ensureAssistantConfig();
    const trimmedPrompt = input.prompt.trim();
    const optimizedPrompt = await this.callAssistantProvider(
      assistantConfig,
      trimmedPrompt,
    );

    return {
      originalPrompt: input.prompt,
      optimizedPrompt,
    };
  }

  /**
   * 使用已启用的辅助模型配置执行无持久化图片理解。
   */
  async recognizeImage(
    input: ImageRecognitionRequest,
  ): Promise<ImageRecognitionResponse> {
    const assistantConfig = await this.ensureAssistantConfig();
    const image = parseImageDataUrl(input.imageDataUrl);
    const result = await this.callImageRecognitionProvider(
      assistantConfig,
      input.prompt.trim(),
      image,
    );

    return { result };
  }

  /**
   * 根据辅助模型配置调用真实第三方模型优化提示词。
   */
  private async callAssistantProvider(
    config: AssistantModelConfigEntity,
    prompt: string,
  ) {
    if (!config.enabled) {
      throw new BadRequestException('辅助模型未启用');
    }
    if (!config.modelName.trim()) {
      throw new BadRequestException('辅助模型缺少模型名称');
    }
    const runtime = this.getAssistantRuntime(config);

    try {
      switch (config.mode) {
        case 'openai':
          return await this.callOpenAiAssistant(config, runtime, prompt);
        case 'claude':
          return await this.callClaudeAssistant(config, runtime, prompt);
      }
    } catch (error) {
      throw new BadGatewayException(
        `提示词优化请求失败：${toProviderErrorMessage(error)}`,
      );
    }
  }

  /**
   * 使用 OpenAI Chat Completions 协议优化提示词。
   */
  private async callOpenAiAssistant(
    config: AssistantModelConfigEntity,
    runtime: AssistantRuntime,
    prompt: string,
  ) {
    const response = await axios.post<OpenAiChatResponse>(
      runtime.url,
      {
        model: config.modelName,
        messages: [
          {
            role: 'system',
            content: promptOptimizerSystemPrompt,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.6,
      },
      {
        headers: {
          Authorization: `Bearer ${runtime.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: assistantRequestTimeoutMs,
      },
    );
    const optimizedPrompt =
      response.data.choices?.[0]?.message?.content?.trim();

    if (!optimizedPrompt) {
      throw new Error('辅助模型返回内容为空');
    }

    return optimizedPrompt;
  }

  /**
   * 使用 Claude Messages 协议优化提示词。
   */
  private async callClaudeAssistant(
    config: AssistantModelConfigEntity,
    runtime: AssistantRuntime,
    prompt: string,
  ) {
    const response = await axios.post<ClaudeMessageResponse>(
      runtime.url,
      {
        model: config.modelName,
        max_tokens: 1800,
        system: promptOptimizerSystemPrompt,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.6,
      },
      {
        headers: {
          'x-api-key': runtime.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        timeout: assistantRequestTimeoutMs,
      },
    );
    const optimizedPrompt = response.data.content
      ?.find((item) => item.type === 'text' && item.text)
      ?.text?.trim();

    if (!optimizedPrompt) {
      throw new Error('辅助模型返回内容为空');
    }

    return optimizedPrompt;
  }

  /**
   * 根据辅助模型配置调用真实第三方模型分析图片。
   */
  private async callImageRecognitionProvider(
    config: AssistantModelConfigEntity,
    prompt: string,
    image: ParsedImageDataUrl,
  ) {
    if (!config.enabled) {
      throw new BadRequestException('辅助模型未启用');
    }
    if (!config.modelName.trim()) {
      throw new BadRequestException('辅助模型缺少模型名称');
    }
    const runtime = this.getAssistantRuntime(config);

    try {
      switch (config.mode) {
        case 'openai':
          return await this.callOpenAiImageRecognition(
            config,
            runtime,
            prompt,
            image,
          );
        case 'claude':
          return await this.callClaudeImageRecognition(
            config,
            runtime,
            prompt,
            image,
          );
      }
    } catch (error) {
      throw new BadGatewayException(
        `识图请求失败：${toProviderErrorMessage(error)}`,
      );
    }
  }

  /**
   * 使用 OpenAI Chat Completions 视觉消息格式分析图片。
   */
  private async callOpenAiImageRecognition(
    config: AssistantModelConfigEntity,
    runtime: AssistantRuntime,
    prompt: string,
    image: ParsedImageDataUrl,
  ) {
    const response = await axios.post<OpenAiChatResponse>(
      runtime.url,
      {
        model: config.modelName,
        messages: [
          {
            role: 'system',
            content: imageRecognitionSystemPrompt,
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt,
              },
              {
                type: 'image_url',
                image_url: {
                  url: image.dataUrl,
                },
              },
            ],
          },
        ],
        temperature: 0.3,
      },
      {
        headers: {
          Authorization: `Bearer ${runtime.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: assistantRequestTimeoutMs,
      },
    );
    const result = response.data.choices?.[0]?.message?.content?.trim();

    if (!result) {
      throw new Error('辅助模型返回内容为空');
    }

    return result;
  }

  /**
   * 使用 Claude Messages 视觉消息格式分析图片。
   */
  private async callClaudeImageRecognition(
    config: AssistantModelConfigEntity,
    runtime: AssistantRuntime,
    prompt: string,
    image: ParsedImageDataUrl,
  ) {
    const response = await axios.post<ClaudeMessageResponse>(
      runtime.url,
      {
        model: config.modelName,
        max_tokens: 2400,
        system: imageRecognitionSystemPrompt,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt,
              },
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: image.mimeType,
                  data: image.base64Data,
                },
              },
            ],
          },
        ],
        temperature: 0.3,
      },
      {
        headers: {
          'x-api-key': runtime.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        timeout: assistantRequestTimeoutMs,
      },
    );
    const result = response.data.content
      ?.find((item) => item.type === 'text' && item.text)
      ?.text?.trim();

    if (!result) {
      throw new Error('辅助模型返回内容为空');
    }

    return result;
  }

  /**
   * 从辅助模型配置中读取第三方请求运行时参数。
   */
  private getAssistantRuntime(config: AssistantModelConfigEntity) {
    if (!config.url.trim()) {
      throw new BadRequestException('辅助模型缺少请求地址');
    }

    const apiKey = decryptSecret(config.apiKeyEncrypted);

    if (!apiKey) {
      throw new BadRequestException('辅助模型缺少 API key');
    }

    return {
      apiKey,
      url: config.url.trim(),
    };
  }

  /**
   * 确保数据库中存在固定 id 的辅助模型配置。
   */
  private async ensureAssistantConfig() {
    const existing = await this.assistantConfigRepository.findOneBy({
      id: assistantConfigId,
    });

    if (existing) {
      return existing;
    }

    const created = this.assistantConfigRepository.create({
      id: assistantConfigId,
      mode: 'openai',
      url: '',
      apiKeyMasked: null,
      apiKeyEncrypted: null,
      modelName: '',
      enabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return this.assistantConfigRepository.save(created);
  }

  /**
   * 将辅助模型实体转换为前端可接收的配置结构。
   */
  private toAssistantModelConfig(
    entity: AssistantModelConfigEntity,
  ): AssistantModelConfig {
    return {
      mode: entity.mode,
      url: entity.url,
      apiKeyMasked: entity.apiKeyMasked ?? undefined,
      modelName: entity.modelName,
      enabled: entity.enabled,
      updatedAt: entity.updatedAt.toISOString(),
    };
  }
}

/**
 * 将第三方请求错误转换为可展示摘要，避免泄露密钥。
 */
function toProviderErrorMessage(error: unknown) {
  if (error instanceof AxiosError) {
    const responseMessage = extractProviderResponseMessage(
      error.response?.data,
    );
    return responseMessage || error.message;
  }

  return error instanceof Error ? error.message : '未知错误';
}

/**
 * 解析前端上传的图片 data URL，供不同视觉模型协议复用。
 */
function parseImageDataUrl(dataUrl: string): ParsedImageDataUrl {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);

  if (!match) {
    throw new BadRequestException('图片格式不正确');
  }

  return {
    base64Data: match[2],
    dataUrl,
    mimeType: match[1],
  };
}

/**
 * 从第三方响应体中提取最小错误消息。
 */
function extractProviderResponseMessage(data: unknown): string {
  if (typeof data === 'string') {
    return data.slice(0, 500);
  }

  if (typeof data !== 'object' || data === null) {
    return '';
  }

  const payload = data as {
    error?: { message?: unknown };
    message?: unknown;
  };

  if (typeof payload.error?.message === 'string') {
    return payload.error.message;
  }

  if (typeof payload.message === 'string') {
    return payload.message;
  }

  return '';
}
