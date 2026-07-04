import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type {
  AiGeneratedImageModelConfig,
  AiImageModelConfigRequest,
  AssistantModelConfig,
  ImageRecognitionRequest,
  ImageRecognitionResponse,
  PromptOptimizeRequest,
  PromptOptimizeResponse,
  UpdateAssistantModelConfigInput,
} from '@ai-image-codexu/shared';
import { aiGeneratedImageModelConfigSchema } from '@ai-image-codexu/shared';
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
const imageProviderConfigSystemPrompt = [
  '你是生图 HTTP 模板配置生成器。你的唯一任务是把官方或第三方图片生成 API 文档转换成一条可直接落库的模型配置 JSON。',
  '必须严格输出一个 JSON 对象。禁止输出 Markdown、代码块、解释、注释、前后缀文本或自然语言说明。',
  '输出顶层字段只能是：name、providerType、deliveryMode、baseUrl、generationPath、editPath、modelName、fieldMapping、fieldOverrides、pollingConfig、httpConfig、enabled。',
  'providerType 必须恒等于 "configurable-http"；enabled 必须恒等于 false，因为 AI 生成配置不会携带真实 API key。',
  '禁止生成 id、createdAt、updatedAt、apiKey、apiKeyMasked、apiKeyEncrypted。禁止编造真实密钥。所有鉴权请求头只能保存 {{apiKey}} 占位符。',
  '',
  '【核心概念】',
  'httpConfig.request.body 不是第三方 API 的原始最终请求体，而是“本项目业务字段 -> 第三方 API path/value”的声明式参数配置。',
  'body 第一层只能使用 prompt、aspectRatio、resolution、quantity、referenceImages、extra。',
  '后端运行时会从空对象开始组装最终请求体：先写入 extra 固定参数，再按 path 写入 prompt/aspectRatio/resolution/quantity，最后按 referenceImages 注入参考图。',
  'path 使用点路径和数组路径，例如 prompt、size、n、contents[0].parts[0].text、generationConfig.imageConfig.aspectRatio、contents[0].parts[]。',
  '如果某个选项的 value 是 null，表示用户选择该 label 时不写入对应 path，常用于 auto。',
  '',
  '【请求地址与鉴权】',
  'httpConfig.request.url 必须是完整 endpoint，不要只写域名或 base URL。',
  'OpenAI 风格通常是 /v1/images/generations 或兼容路径，模型名通常通过 extra 写入 body.model。',
  'Google/Gemini 风格通常是 /v1beta/models/{model}:generateContent，模型名通常已经在 URL 中，不要再重复写入 body.model。',
  'headers 必须是字符串值对象。OpenAI 风格常用 Authorization: Bearer {{apiKey}} 和 Content-Type: application/json。',
  'Google/Gemini 风格常用 x-goog-api-key: {{apiKey}} 和 Content-Type: application/json。',
  'contentType 只能是 "json" 或 "multipart"。除非文档明确要求 multipart 文件上传，否则优先使用 json。',
  '',
  '【基础生图参数必须尽量完整】',
  '基础生图参数指：尺寸比例 aspectRatio、分辨率 resolution、生成数量 quantity。即使文档没有完整列出，也必须根据 API 类型补齐一个可编辑、可运行的默认配置。',
  'aspectRatio 用于前端展示比例选项，必须写成 { "path": "...", "options": [{ "label": "...", "value": ... }] }。',
  'resolution 用于前端展示清晰度/分辨率选项，必须写成 { "path": "...", "options": [{ "label": "...", "value": ... }] }。',
  'quantity 用于前端展示生成数量，必须写成 { "enabled": boolean, "path": "...", "min": 1, "max": number, "defaultValue": 1 }。如果接口不支持数量或者未显示数量配置，enabled=false；如果接口支持但文档没写上限，max 默认 3。',
  '如果文档明确列出参数名或取值，优先使用文档。文档缺少个别基础参数时，按识别到的 API 类型使用下面的 OpenAI 或 Google 缺省规则补齐。',
  '',
  '【OpenAI 风格基础参数缺省规则】',
  '当文档表现为 OpenAI Images 或 OpenAI-compatible 风格时：',
  'prompt.path 默认 "prompt"。',
  'aspectRatio.path 默认 "size"；options 默认 [{"label":"auto","value":"auto"},{"label":"1:1","value":"1024x1024"},{"label":"4:3","value":"1536x1024"},{"label":"3:4","value":"1024x1536"},{"label":"16:9","value":"1536x864"},{"label":"9:16","value":"864x1536"}]。如果文档列出其它 size，以文档为准，但不要缺少常用比例。',
  'resolution.path 默认 "quality"；options 默认 [{"label":"0.5k","value":"low"},{"label":"1k","value":"medium"},{"label":"2k","value":"high"},{"label":"4k","value":"high"}]。如果文档把分辨率并入 size，也仍然保留 resolution 配置，使用最接近的 quality 或文档字段。',
  'quantity.enabled 默认 true；quantity.path 默认 "n"；min=1；max 优先按文档，否则默认 3；defaultValue=1。',
  'extra 至少应包含 {"path":"model","value":"模型名"}；如果接口返回 base64，通常还需要 {"path":"response_format","value":"b64_json"}，除非文档不支持。',
  '',
  '【Google/Gemini 风格基础参数缺省规则】',
  '当文档表现为 Google Gemini generateContent 风格时：',
  'prompt.path 默认 "contents[0].parts[0].text"。',
  'aspectRatio.path 默认 "generationConfig.imageConfig.aspectRatio"；options 默认 [{"label":"auto","value":null},{"label":"1:1","value":"1:1"},{"label":"4:3","value":"4:3"},{"label":"3:4","value":"3:4"},{"label":"16:9","value":"16:9"},{"label":"9:16","value":"9:16"}]。auto 的 value 使用 null，表示不传 aspectRatio。',
  'resolution.path 默认 "generationConfig.imageConfig.imageSize"；options 默认 [{"label":"0.5k","value":"512"},{"label":"1k","value":"1K"},{"label":"2k","value":"2K"},{"label":"4k","value":"4K"}]。如果文档使用 imageSize、resolution 或其它字段名，以文档字段名为准。',
  'quantity 默认 enabled=false，因为很多 Gemini 图片接口不支持一次多张；如果文档明确支持 candidateCount 或 numberOfImages，则 enabled=true，path 使用文档字段，max 优先按文档，否则默认 3。',
  'extra 必须包含 {"path":"generationConfig.responseModalities","value":["IMAGE"]}。如果文档要求同时返回 TEXT 和 IMAGE，就按文档写 ["TEXT","IMAGE"]。',
  '',
  '【参考图配置规则】',
  'referenceImages 必须始终生成，至少为 {"mode":"none","maxCount":16}。',
  '如果文档只描述文生图且没有图生图/编辑/参考图能力，使用 mode="none"，maxCount=16。',
  '如果文档支持 JSON 内联 base64 图片，使用 mode="inlineBase64"，设置 path 和 template。path 指向要追加图片对象的位置，常见 Google/Gemini 是 "contents[0].parts[]"；template 必须使用占位符，不写真实图片，例如 {"inlineData":{"mimeType":"{{mimeType}}","data":"{{base64}}"}}。',
  '如果文档支持 OpenAI/Gemini 类 multipart 文件上传，使用 mode="multipart"，设置 fieldName 为文档中的文件字段名，例如 "image"、"images"、"file"。contentType 必须为 "multipart"。',
  '如果文档明确要求公网图片 URL 数组，才使用 mode="urlArray"，设置 path 为 URL 数组写入位置；否则不要使用 urlArray，因为本项目暂不负责把本地参考图托管成公网 URL。',
  '如果文档同时有文生图和图生图端点：若端点和 contentType 相同，优先生成兼容参考图的配置；若端点或 contentType 不同，优先选择文档主推或用户信息指向的端点，无法判断时优先文生图并把 referenceImages.mode 设为 none。',
  '',
  '【extra 固定参数规则】',
  'extra 是第三方 API 自有固定参数数组，每项必须是 {"path":"...","value":JSON值}。',
  '所有不属于 prompt/aspectRatio/resolution/quantity/referenceImages 的请求体固定字段都应写入 extra，例如 model、response_format、generationConfig.responseModalities、generationConfig.imageConfig.seed、output_format。',
  '不要把用户运行时会变化的提示词、比例、分辨率、数量、参考图写入 extra。',
  '',
  '【响应提取规则】',
  'httpConfig.response.images.type 只能是 base64、dataUrl、url。',
  '如果响应返回 base64 字段，type="base64"，填写 dataPath，例如 OpenAI: "data[].b64_json"，Google: "candidates[].content.parts[].inlineData.data"。',
  '如果响应返回 data URL，type="dataUrl"，填写 dataPath。',
  '如果响应返回远程图片 URL，type="url"，填写 urlPath，例如 "data[].url" 或文档中的结果 URL 路径。',
  '尽量填写 mimeTypePath；如果没有动态 MIME，就填写固定 mimeType，例如 "image/png"。',
  '如果响应中有 token 消耗，填写 response.usage.totalTokensPath，例如 OpenAI "usage.total_tokens"，Google "usageMetadata.totalTokenCount"；没有就省略 usage。',
  '',
  '【轮询接口规则】',
  '如果文档是异步任务接口，deliveryMode 必须为 "polling"，并填写 httpConfig.polling。',
  'polling.request 必须包含完整轮询 endpoint，可使用 {{taskId}} 占位符；轮询请求头也只能使用 {{apiKey}} 占位符。',
  'taskIdPath 从创建任务响应里提取任务 ID；statusPath、successValue、failureValue 从轮询响应判断状态；intervalMs 默认 5000；timeoutMs 默认 300000。',
  '轮询成功后的图片提取优先写 polling.response；如果轮询响应和创建响应格式相同，可省略 polling.response 使用顶层 response。',
  '',
  '【文档不足时的决策】',
  '必须先根据 URL、endpoint、请求体示例、字段名判断 API 类型：OpenAI-compatible 或 Google/Gemini-compatible。',
  '如果文档中基础参数只缺一部分，不要留空；按对应 API 类型的缺省规则补齐。',
  '如果无法判断 API 类型，优先按 Google/Gemini generateContent 风格处理含 contents、parts、generationConfig、inlineData 的文档；优先按 OpenAI 风格处理含 prompt、model、n、size、quality、response_format、b64_json 的文档。',
  '如果仍然无法判断，生成最保守配置：prompt.path="prompt"，aspectRatio.path="size"，resolution.path="quality"，quantity.enabled=false，referenceImages.mode="none"，并确保 response.images 至少有一个文档中能找到的图片路径。',
  '',
  '【最小合法 JSON 示例】',
  '{"name":"Example Image","providerType":"configurable-http","deliveryMode":"sync","baseUrl":"","generationPath":"","editPath":"","modelName":"example-image","fieldMapping":{},"fieldOverrides":{},"pollingConfig":{},"enabled":false,"httpConfig":{"request":{"method":"POST","url":"https://api.example.com/v1/images","contentType":"json","headers":{"Authorization":"Bearer {{apiKey}}","Content-Type":"application/json"},"body":{"prompt":{"path":"prompt"},"aspectRatio":{"path":"size","options":[{"label":"auto","value":"auto"},{"label":"1:1","value":"1024x1024"}]},"resolution":{"path":"quality","options":[{"label":"1k","value":"medium"},{"label":"2k","value":"high"}]},"quantity":{"enabled":true,"path":"n","min":1,"max":3,"defaultValue":1},"referenceImages":{"mode":"none","maxCount":16},"extra":[{"path":"model","value":"example-image"},{"path":"response_format","value":"b64_json"}]}},"response":{"images":{"type":"base64","dataPath":"data[].b64_json","mimeType":"image/png"}}}}',
].join('\n');
const imageProviderConfigMaxSourceChars = 36_000;
const imageProviderConfigFetchTimeoutMs = 20_000;

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
   * 使用辅助模型把接口文档 URL 或文本转换为可落库的生图 HTTP 模板配置。
   */
  async generateImageProviderConfig(
    input: AiImageModelConfigRequest,
  ): Promise<AiGeneratedImageModelConfig> {
    const assistantConfig = await this.ensureAssistantConfig();
    const source = await this.buildImageProviderConfigSource(input);
    const prompt = buildImageProviderConfigUserPrompt(input, source);

    return this.callImageProviderConfigAssistant(assistantConfig, prompt);
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
   * 根据辅助模型配置调用真实第三方模型生成生图 HTTP 配置 JSON。
   */
  private async callImageProviderConfigAssistant(
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
      const content =
        config.mode === 'openai'
          ? await this.callOpenAiImageProviderConfig(config, runtime, prompt)
          : await this.callClaudeImageProviderConfig(config, runtime, prompt);

      return parseGeneratedImageProviderConfig(content);
    } catch (error) {
      throw new BadGatewayException(
        `AI 配置生成失败：${toProviderErrorMessage(error)}`,
      );
    }
  }

  /**
   * 使用 OpenAI Chat Completions 协议生成生图模型配置 JSON。
   */
  private async callOpenAiImageProviderConfig(
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
            content: imageProviderConfigSystemPrompt,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.1,
        max_tokens: 8000,
      },
      {
        headers: {
          Authorization: `Bearer ${runtime.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: assistantRequestTimeoutMs,
      },
    );
    const content = response.data.choices?.[0]?.message?.content?.trim();

    if (!content) {
      throw new Error('辅助模型返回内容为空');
    }

    return content;
  }

  /**
   * 使用 Claude Messages 协议生成生图模型配置 JSON。
   */
  private async callClaudeImageProviderConfig(
    config: AssistantModelConfigEntity,
    runtime: AssistantRuntime,
    prompt: string,
  ) {
    const response = await axios.post<ClaudeMessageResponse>(
      runtime.url,
      {
        model: config.modelName,
        max_tokens: 8000,
        system: imageProviderConfigSystemPrompt,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.1,
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
    const content = response.data.content
      ?.find((item) => item.type === 'text' && item.text)
      ?.text?.trim();

    if (!content) {
      throw new Error('辅助模型返回内容为空');
    }

    return content;
  }

  /**
   * 汇总用户填写的文档 URL 与文本；文档抓取只是增强上下文，失败时保留 URL 继续交给辅助模型。
   */
  private async buildImageProviderConfigSource(
    input: AiImageModelConfigRequest,
  ) {
    const sections: string[] = [];
    const sourceUrl = input.sourceUrl?.trim();
    const sourceText = input.sourceText?.trim();

    if (sourceUrl) {
      sections.push(`文档地址：${sourceUrl}`);

      try {
        sections.push(`文档抓取内容：\n${await fetchDocumentText(sourceUrl)}`);
      } catch {
        // 抓取失败不阻断 AI 配置生成；辅助模型仍可根据 URL 或用户粘贴信息尝试生成。
      }
    }

    if (sourceText) {
      sections.push(`用户补充信息：\n${sourceText}`);
    }

    return truncateText(sections.join('\n\n'), imageProviderConfigMaxSourceChars);
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
 * 构造 AI 配置生成的用户提示词，系统提示词负责规则，这里只提供输入资料和偏好。
 */
function buildImageProviderConfigUserPrompt(
  input: AiImageModelConfigRequest,
  source: string,
) {
  const configName = input.configName?.trim() || '未指定';
  const modelName = input.modelName?.trim() || '未指定';

  return [
    '请根据下面的 API 文档资料生成一个 AI Image Codexu 生图模型配置 JSON。',
    `用户期望配置名称：${configName}`,
    `用户期望模型快照：${modelName}`,
    '必须把生成结果设置为未启用：enabled=false。',
    '如果文档同时包含文生图和图生图：优先生成当前项目能表达的主请求模板；如果两者 endpoint 或 contentType 不同，优先生成支持参考图的图生图模板，并让 referenceImages 正确表达模式。',
    '如果文档中请求地址包含模型名，不要再把模型名重复写入 body；如果文档要求 body.model，则写入 request.body.extra。',
    '请严格输出 JSON 对象。',
    '--- 文档资料开始 ---',
    source,
    '--- 文档资料结束 ---',
  ].join('\n');
}

/**
 * 抓取公开文档 URL 并转为紧凑文本，避免把 HTML 噪声直接喂给辅助模型。
 */
async function fetchDocumentText(url: string) {
  const parsedUrl = new URL(url);

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new BadRequestException('文档地址只支持 http 或 https');
  }

  let response: Awaited<ReturnType<typeof axios.get<string>>>;

  try {
    response = await axios.get<string>(url, {
      headers: {
        Accept: 'text/html,text/plain,application/json,*/*',
      },
      maxContentLength: 800_000,
      responseType: 'text',
      timeout: imageProviderConfigFetchTimeoutMs,
    });
  } catch (error) {
    throw new BadGatewayException(
      `文档抓取失败：${toProviderErrorMessage(error)}`,
    );
  }

  return truncateText(
    normalizeDocumentText(String(response.data ?? '')),
    imageProviderConfigMaxSourceChars,
  );
}

/**
 * 从辅助模型文本中提取并校验 JSON 配置对象。
 */
function parseGeneratedImageProviderConfig(content: string) {
  const jsonText = extractJsonObjectText(content);
  const parsed = JSON.parse(jsonText) as unknown;

  const generated = aiGeneratedImageModelConfigSchema.parse(parsed);

  assertGeneratedConfigDoesNotStoreSecrets(generated);

  return generated;
}

/**
 * AI 配置生成不能把真实密钥写入数据库；敏感请求头必须只保存 {{apiKey}} 占位符。
 */
function assertGeneratedConfigDoesNotStoreSecrets(
  config: AiGeneratedImageModelConfig,
) {
  assertSensitiveHeadersUsePlaceholder(config.httpConfig.request.headers);

  if (config.httpConfig.polling) {
    assertSensitiveHeadersUsePlaceholder(
      config.httpConfig.polling.request.headers,
    );
  }
}

function assertSensitiveHeadersUsePlaceholder(headers?: Record<string, string>) {
  Object.entries(headers ?? {}).forEach(([name, value]) => {
    if (!isSensitiveHeaderName(name) || value.includes('{{apiKey}}')) {
      return;
    }

    throw new Error(`敏感请求头 ${name} 必须使用 {{apiKey}} 占位符`);
  });
}

function isSensitiveHeaderName(name: string) {
  return /authorization|api[-_ ]?key|token|secret/i.test(name);
}

/**
 * 兼容模型偶尔返回 ```json 包裹的情况，但仍只接受对象 JSON。
 */
function extractJsonObjectText(content: string) {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(content);
  const candidate = (fenced?.[1] ?? content).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');

  if (start === -1 || end === -1 || end <= start) {
    throw new Error('辅助模型未返回 JSON 对象');
  }

  return candidate.slice(start, end + 1);
}

/**
 * 粗略清洗 HTML 文档，保留接口路径、JSON 示例和正文信息。
 */
function normalizeDocumentText(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|section|article|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * 限制传给辅助模型的文档长度，保留开头的接口说明和示例。
 */
function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}\n\n[内容已截断]`;
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
