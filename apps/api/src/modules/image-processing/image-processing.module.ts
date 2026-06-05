import { Module } from '@nestjs/common';
import { ImageProcessingController } from './image-processing.controller';
import { ImageStorageService } from './image-storage.service';

@Module({
  controllers: [ImageProcessingController],
  providers: [ImageStorageService],
  exports: [ImageStorageService],
})
export class ImageProcessingModule {}
