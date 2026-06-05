import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, normalize, resolve } from 'node:path';

@Injectable()
export class ImageStorageService implements OnModuleInit {
  private readonly logger = new Logger(ImageStorageService.name);

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const rootPath = this.getRootPath();
    await mkdir(rootPath, { recursive: true });
    this.logger.log(`Image storage path ready: ${rootPath}`);
  }

  getRootPath() {
    const configuredPath = this.configService
      .get<string>('IMAGE_STORAGE_PATH')
      ?.trim();

    if (!configuredPath) {
      throw new Error('IMAGE_STORAGE_PATH is required');
    }

    return resolve(configuredPath);
  }

  resolveLocalPath(relativePath: string) {
    const normalizedPath = this.normalizeRelativePath(relativePath);
    return join(this.getRootPath(), normalizedPath);
  }

  toPublicUrl(relativePath: string) {
    const normalizedPath = this.normalizeRelativePath(relativePath);
    return `/api/images/${normalizedPath.replace(/\\/g, '/')}`;
  }

  /**
   * Stores generated image bytes under IMAGE_STORAGE_PATH and returns its public URL.
   */
  async saveImage(relativePath: string, content: Buffer) {
    const normalizedPath = this.normalizeRelativePath(relativePath);
    const localPath = join(this.getRootPath(), normalizedPath);

    await mkdir(dirname(localPath), { recursive: true });
    await writeFile(localPath, content);

    return this.toPublicUrl(normalizedPath);
  }

  private normalizeRelativePath(relativePath: string) {
    const trimmedPath = relativePath.trim();

    if (!trimmedPath) {
      throw new BadRequestException('图片路径不能为空');
    }

    const normalizedPath = normalize(trimmedPath);

    if (
      isAbsolute(normalizedPath) ||
      normalizedPath === '..' ||
      normalizedPath.startsWith('../') ||
      normalizedPath.startsWith('..\\')
    ) {
      throw new BadRequestException('图片路径不能越过存储根目录');
    }

    return normalizedPath;
  }
}
