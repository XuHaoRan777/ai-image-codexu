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
  CreateImageJobInput,
  CreateImageModelConfigInput,
  UpdateImageModelConfigInput,
} from '@ai-image-codexu/shared';
import {
  createImageJobSchema,
  createImageModelConfigSchema,
  updateImageModelConfigSchema,
} from '@ai-image-codexu/shared';
import { ImageGenerationService } from './image-generation.service';

@Controller()
export class ImageGenerationController {
  constructor(
    private readonly imageGenerationService: ImageGenerationService,
  ) {}

  @Get('image-model-configs')
  listImageModelConfigs() {
    return this.imageGenerationService.listImageModelConfigs();
  }

  @Post('image-model-configs')
  createImageModelConfig(@Body() body: CreateImageModelConfigInput) {
    return this.imageGenerationService.createImageModelConfig(
      createImageModelConfigSchema.parse(body),
    );
  }

  @Patch('image-model-configs/:id')
  updateImageModelConfig(
    @Param('id') id: string,
    @Body() body: UpdateImageModelConfigInput,
  ) {
    const updated = this.imageGenerationService.updateImageModelConfig(
      id,
      updateImageModelConfigSchema.parse(body),
    );

    if (!updated) {
      throw new NotFoundException('生图模型配置不存在');
    }

    return updated;
  }

  @Delete('image-model-configs/:id')
  deleteImageModelConfig(@Param('id') id: string) {
    const deleted = this.imageGenerationService.deleteImageModelConfig(id);

    if (!deleted) {
      throw new NotFoundException('生图模型配置不存在');
    }

    return { deleted: true as const };
  }

  @Post('image-jobs')
  createImageJob(@Body() body: CreateImageJobInput) {
    return this.imageGenerationService.createImageJob(
      createImageJobSchema.parse(body),
    );
  }

  @Get('image-jobs/:id')
  getImageJob(@Param('id') id: string) {
    const job = this.imageGenerationService.getImageJob(id);

    if (!job) {
      throw new NotFoundException('生图任务不存在');
    }

    return job;
  }
}
