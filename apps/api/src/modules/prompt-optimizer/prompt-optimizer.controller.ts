import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import type {
  PromptOptimizeRequest,
  UpdateAssistantModelConfigInput,
} from '@ai-image-codexu/shared';
import {
  promptOptimizeRequestSchema,
  updateAssistantModelConfigSchema,
} from '@ai-image-codexu/shared';
import { PromptOptimizerService } from './prompt-optimizer.service';

@Controller()
export class PromptOptimizerController {
  constructor(
    private readonly promptOptimizerService: PromptOptimizerService,
  ) {}

  @Get('assistant-config')
  getAssistantConfig() {
    return this.promptOptimizerService.getAssistantConfig();
  }

  @Put('assistant-config')
  updateAssistantConfig(@Body() body: UpdateAssistantModelConfigInput) {
    return this.promptOptimizerService.updateAssistantConfig(
      updateAssistantModelConfigSchema.parse(body),
    );
  }

  @Post('prompt/optimize')
  optimizePrompt(@Body() body: PromptOptimizeRequest) {
    return this.promptOptimizerService.optimizePrompt(
      promptOptimizeRequestSchema.parse(body),
    );
  }
}
