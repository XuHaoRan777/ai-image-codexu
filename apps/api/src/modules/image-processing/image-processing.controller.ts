import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { readFile } from 'node:fs/promises';
import { ImageStorageService } from './image-storage.service';

@Controller('images')
export class ImageProcessingController {
  constructor(private readonly imageStorageService: ImageStorageService) {}

  @Get('*path')
  async readImage(@Param('path') path: string[], @Res() response: Response) {
    const relativePath = path.join('/');
    const localPath = this.imageStorageService.resolveLocalPath(relativePath);
    const content = await readFile(localPath);

    response.type(resolveImageMimeType(relativePath));
    response.send(content);
  }
}

function resolveImageMimeType(path: string) {
  const lowerPath = path.toLowerCase();

  if (lowerPath.endsWith('.jpg') || lowerPath.endsWith('.jpeg')) {
    return 'image/jpeg';
  }
  if (lowerPath.endsWith('.webp')) {
    return 'image/webp';
  }

  return 'image/png';
}
