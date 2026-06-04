import { Module } from '@nestjs/common';
import { ImageProcessingModule } from '../image-processing/image-processing.module';
import { ImageGenerationController } from './image-generation.controller';
import { ImageGenerationService } from './image-generation.service';

@Module({
  imports: [ImageProcessingModule],
  controllers: [ImageGenerationController],
  providers: [ImageGenerationService],
  exports: [ImageGenerationService],
})
export class ImageGenerationModule {}
