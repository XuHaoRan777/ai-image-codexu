import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ImageModelConfigEntity } from '../../entity/ImageModelConfig';
import { ImageProcessingModule } from '../image-processing/image-processing.module';
import { ImageGenerationController } from './image-generation.controller';
import { ImageProviderDispatcher } from './image-generation.providers';
import { ImageGenerationService } from './image-generation.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ImageModelConfigEntity]),
    ImageProcessingModule,
  ],
  controllers: [ImageGenerationController],
  providers: [ImageGenerationService, ImageProviderDispatcher],
  exports: [ImageGenerationService],
})
export class ImageGenerationModule {}
