import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import {
  dirname,
  isAbsolute,
  join,
  normalize,
  relative,
  resolve,
} from 'node:path';

@Injectable()
export class ImageStorageService implements OnModuleInit {
  private readonly logger = new Logger(ImageStorageService.name);

  /**
   * 注入配置服务以读取图片存储路径。
   */
  constructor(private readonly configService: ConfigService) {}

  /**
   * 模块初始化时确保图片存储根目录存在。
   */
  async onModuleInit() {
    const rootPath = this.getRootPath();
    await mkdir(rootPath, { recursive: true });
    this.logger.log(`Image storage path ready: ${rootPath}`);
  }

  /**
   * 读取并解析 IMAGE_STORAGE_PATH 配置。
   */
  getRootPath() {
    const configuredPath = this.configService
      .get<string>('IMAGE_STORAGE_PATH')
      ?.trim();

    if (!configuredPath) {
      throw new Error('IMAGE_STORAGE_PATH is required');
    }

    return resolve(configuredPath);
  }

  /**
   * 将图片相对路径转换为存储根目录下的本地绝对路径。
   */
  resolveLocalPath(relativePath: string) {
    const normalizedPath = this.normalizeRelativePath(relativePath);
    return join(this.getRootPath(), normalizedPath);
  }

  /**
   * 将图片相对路径转换为前端可访问的公开 URL。
   */
  toPublicUrl(relativePath: string) {
    const normalizedPath = this.normalizeRelativePath(relativePath);
    return `/api/images/${normalizedPath.replace(/\\/g, '/')}`;
  }

  /**
   * 将生成图片保存到 IMAGE_STORAGE_PATH 下，并返回公开 URL。
   */
  async saveImage(relativePath: string, content: Buffer) {
    const normalizedPath = this.normalizeRelativePath(relativePath);
    const localPath = join(this.getRootPath(), normalizedPath);

    await mkdir(dirname(localPath), { recursive: true });
    await writeFile(localPath, content);

    return this.toPublicUrl(normalizedPath);
  }

  /**
   * 根据公开 URL 删除存储根目录下的本地图片文件。
   */
  async deleteImageByPublicUrl(publicUrl: string) {
    const relativePath = this.toRelativePathFromPublicUrl(publicUrl);

    if (!relativePath) {
      return false;
    }

    await rm(this.resolveLocalPath(relativePath), { force: true });
    return true;
  }

  /**
   * 将 /api/images/* 公开 URL 安全还原为图片相对路径。
   */
  toRelativePathFromPublicUrl(publicUrl: string) {
    const trimmedUrl = publicUrl.trim();
    const path = parsePublicImagePath(trimmedUrl);
    const prefix = '/api/images/';

    if (!path.startsWith(prefix)) {
      return null;
    }

    try {
      return this.normalizeRelativePath(
        decodeURIComponent(path.slice(prefix.length)),
      );
    } catch {
      return null;
    }
  }

  /**
   * 规范化图片相对路径，并阻止目录穿越。
   */
  private normalizeRelativePath(relativePath: string) {
    const trimmedPath = relativePath.trim();

    if (!trimmedPath || trimmedPath === '.') {
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

    const rootPath = this.getRootPath();
    const localPath = resolve(rootPath, normalizedPath);
    const rootRelativePath = relative(rootPath, localPath);

    if (
      rootRelativePath === '..' ||
      rootRelativePath.startsWith(`..\\`) ||
      rootRelativePath.startsWith('../') ||
      isAbsolute(rootRelativePath)
    ) {
      throw new BadRequestException('图片路径不能越过存储根目录');
    }

    return normalizedPath;
  }
}

/**
 * 从同源或绝对公开 URL 中提取 pathname。
 */
function parsePublicImagePath(publicUrl: string) {
  try {
    return new URL(publicUrl).pathname;
  } catch {
    return publicUrl.split(/[?#]/, 1)[0];
  }
}
