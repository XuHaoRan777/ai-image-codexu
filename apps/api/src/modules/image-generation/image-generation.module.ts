import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ImageModelConfigEntity } from '../../entity/ImageModelConfig';
import { ImageProcessingModule } from '../image-processing/image-processing.module';
import { ImageGenerationController } from './image-generation.controller';
import { ImageGenerationService } from './image-generation.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ImageModelConfigEntity]),
    ImageProcessingModule,
  ],
  controllers: [ImageGenerationController],
  providers: [ImageGenerationService],
  exports: [ImageGenerationService],
})
export class ImageGenerationModule {}
