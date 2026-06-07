import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import type {
  ImageRecognitionRequest,
  PromptOptimizeRequest,
  UpdateAssistantModelConfigInput,
} from '@ai-image-codexu/shared';
import {
  imageRecognitionRequestSchema,
  promptOptimizeRequestSchema,
  updateAssistantModelConfigSchema,
} from '@ai-image-codexu/shared';
import { PromptOptimizerService } from './prompt-optimizer.service';

@Controller()
export class PromptOptimizerController {
  /**
   * 注入提示词优化服务。
   */
  constructor(
    private readonly promptOptimizerService: PromptOptimizerService,
  ) {}

  @Get('assistant-config')
  /**
   * 查询固定单条辅助模型配置。
   */
  getAssistantConfig() {
    return this.promptOptimizerService.getAssistantConfig();
  }

  @Put('assistant-config')
  /**
   * 校验并更新辅助模型配置。
   */
  async updateAssistantConfig(@Body() body: UpdateAssistantModelConfigInput) {
    return this.promptOptimizerService.updateAssistantConfig(
      updateAssistantModelConfigSchema.parse(body),
    );
  }

  @Post('prompt/optimize')
  /**
   * 校验请求并返回优化后的提示词。
   */
  async optimizePrompt(@Body() body: PromptOptimizeRequest) {
    return this.promptOptimizerService.optimizePrompt(
      promptOptimizeRequestSchema.parse(body),
    );
  }

  @Post('image/recognize')
  /**
   * 校验请求并返回无持久化图片理解结果。
   */
  async recognizeImage(@Body() body: ImageRecognitionRequest) {
    return this.promptOptimizerService.recognizeImage(
      imageRecognitionRequestSchema.parse(body),
    );
  }
}
