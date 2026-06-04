import { Injectable } from '@nestjs/common';
import type {
  AssistantModelConfig,
  PromptOptimizeRequest,
  PromptOptimizeResponse,
  UpdateAssistantModelConfigInput,
} from '@ai-image-codexu/shared';
import { maskSecret } from '../../common/utils/maskSecret';

const now = () => new Date().toISOString();

@Injectable()
export class PromptOptimizerService {
  private assistantConfig: AssistantModelConfig = {
    mode: 'openai',
    baseUrl: '',
    apiKeyMasked: undefined,
    modelName: '',
    enabled: false,
    updatedAt: now(),
  };

  getAssistantConfig() {
    return this.assistantConfig;
  }

  updateAssistantConfig(input: UpdateAssistantModelConfigInput) {
    this.assistantConfig = {
      mode: input.mode,
      baseUrl: input.baseUrl,
      apiKeyMasked:
        input.apiKey === undefined
          ? this.assistantConfig.apiKeyMasked
          : maskSecret(input.apiKey),
      modelName: input.modelName,
      enabled: input.enabled,
      updatedAt: now(),
    };

    return this.assistantConfig;
  }

  optimizePrompt(input: PromptOptimizeRequest): PromptOptimizeResponse {
    const optimizedPrompt = this.assistantConfig.enabled
      ? `${input.prompt.trim()}\n\n画面要求：主体清晰，构图稳定，光影层次明确，细节自然，避免多余文字、水印和畸形结构。`
      : input.prompt.trim();

    return {
      originalPrompt: input.prompt,
      optimizedPrompt,
    };
  }
}
