import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import type {
  AiImageModelConfigRequest,
  CreateImageJobInput,
  CreateImageModelConfigInput,
  UpdateImageModelConfigEnabledInput,
  UpdateImageModelConfigInput,
} from '@ai-image-codexu/shared';
import {
  aiImageModelConfigRequestSchema,
  createImageJobSchema,
  createImageModelConfigSchema,
  updateImageModelConfigEnabledSchema,
  updateImageModelConfigSchema,
} from '@ai-image-codexu/shared';
import { ImageGenerationService } from './image-generation.service';

@Controller()
export class ImageGenerationController {
  /**
   * 注入生图配置与任务服务。
   */
  constructor(
    private readonly imageGenerationService: ImageGenerationService,
  ) {}

  @Get('image-model-configs')
  /**
   * 查询全部生图模型配置。
   */
  listImageModelConfigs() {
    return this.imageGenerationService.listImageModelConfigs();
  }

  @Post('image-model-configs')
  /**
   * 校验并创建新的生图模型配置。
   */
  createImageModelConfig(@Body() body: CreateImageModelConfigInput) {
    return this.imageGenerationService.createImageModelConfig(
      createImageModelConfigSchema.parse(body),
    );
  }

  @Post('image-model-configs/ai-generate')
  /**
   * 使用辅助模型根据文档生成生图 HTTP 配置，并以未启用状态落库。
   */
  createImageModelConfigWithAi(@Body() body: AiImageModelConfigRequest) {
    return this.imageGenerationService.createImageModelConfigWithAi(
      aiImageModelConfigRequestSchema.parse(body),
    );
  }

  @Patch('image-model-configs/:id')
  /**
   * 校验并更新指定生图模型配置。
   */
  async updateImageModelConfig(
    @Param('id') id: string,
    @Body() body: UpdateImageModelConfigInput,
  ) {
    const updated = await this.imageGenerationService.updateImageModelConfig(
      id,
      updateImageModelConfigSchema.parse(body),
    );

    if (!updated) {
      throw new NotFoundException('生图模型配置不存在');
    }

    return updated;
  }

  @Patch('image-model-configs/:id/enabled')
  /**
   * 仅更新指定生图模型配置的启用状态。
   */
  async updateImageModelConfigEnabled(
    @Param('id') id: string,
    @Body() body: UpdateImageModelConfigEnabledInput,
  ) {
    const updated =
      await this.imageGenerationService.updateImageModelConfigEnabled(
        id,
        updateImageModelConfigEnabledSchema.parse(body),
      );

    if (!updated) {
      throw new NotFoundException('生图模型配置不存在');
    }

    return updated;
  }

  @Delete('image-model-configs/:id')
  /**
   * 删除指定生图模型配置。
   */
  async deleteImageModelConfig(@Param('id') id: string) {
    const deleted = await this.imageGenerationService.deleteImageModelConfig(
      id,
    );

    if (!deleted) {
      throw new NotFoundException('生图模型配置不存在');
    }

    return { deleted: true as const };
  }

  @Post('image-jobs')
  /**
   * 校验请求并创建生图任务。
   */
  createImageJob(@Body() body: CreateImageJobInput) {
    return this.imageGenerationService.createImageJob(
      createImageJobSchema.parse(body),
    );
  }

  @Get('image-jobs')
  /**
   * 查询持久化生图任务历史列表。
   */
  listImageJobs() {
    return this.imageGenerationService.listImageJobs();
  }

  @Get('image-jobs/:id')
  /**
   * 查询指定生图任务。
   */
  async getImageJob(@Param('id') id: string) {
    const job = await this.imageGenerationService.getImageJob(id);

    if (!job) {
      throw new NotFoundException('生图任务不存在');
    }

    return job;
  }

  @Delete('image-jobs/:id')
  /**
   * 删除指定生图任务记录及其本地图片文件。
   */
  async deleteImageJob(@Param('id') id: string) {
    const deleted = await this.imageGenerationService.deleteImageJob(id);

    if (!deleted) {
      throw new NotFoundException('生图任务不存在');
    }

    return { deleted: true as const };
  }
}
