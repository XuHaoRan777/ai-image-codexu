import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type {
  AssistantModelConfig,
  PromptOptimizeRequest,
  PromptOptimizeResponse,
  UpdateAssistantModelConfigInput,
} from '@ai-image-codexu/shared';
import { Repository } from 'typeorm';
import { maskSecret } from '../../common/utils/maskSecret';
import { encryptSecret } from '../../common/utils/secretCrypto';
import { AssistantModelConfigEntity } from '../../entity/AssistantModelConfig';

const assistantConfigId = 'default';

@Injectable()
export class PromptOptimizerService {
  constructor(
    @InjectRepository(AssistantModelConfigEntity)
    private readonly assistantConfigRepository: Repository<AssistantModelConfigEntity>,
  ) {}

  async getAssistantConfig() {
    return this.toAssistantModelConfig(await this.ensureAssistantConfig());
  }

  async updateAssistantConfig(input: UpdateAssistantModelConfigInput) {
    const existing = await this.ensureAssistantConfig();

    existing.mode = input.mode;
    existing.baseUrl = input.baseUrl;
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

  async optimizePrompt(
    input: PromptOptimizeRequest,
  ): Promise<PromptOptimizeResponse> {
    const assistantConfig = await this.ensureAssistantConfig();
    const optimizedPrompt = assistantConfig.enabled
      ? `${input.prompt.trim()}\n\n画面要求：主体清晰，构图稳定，光影层次明确，细节自然，避免多余文字、水印和畸形结构。`
      : input.prompt.trim();

    return {
      originalPrompt: input.prompt,
      optimizedPrompt,
    };
  }

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
      baseUrl: '',
      apiKeyMasked: null,
      apiKeyEncrypted: null,
      modelName: '',
      enabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return this.assistantConfigRepository.save(created);
  }

  private toAssistantModelConfig(
    entity: AssistantModelConfigEntity,
  ): AssistantModelConfig {
    return {
      mode: entity.mode,
      baseUrl: entity.baseUrl,
      apiKeyMasked: entity.apiKeyMasked ?? undefined,
      modelName: entity.modelName,
      enabled: entity.enabled,
      updatedAt: entity.updatedAt.toISOString(),
    };
  }
}
