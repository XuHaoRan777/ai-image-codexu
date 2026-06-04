import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { ConfigModule } from '@nestjs/config';
import {
  ApiResponseCode,
  type ApiResponse,
  type ImageModelConfig,
} from '@ai-image-codexu/shared';
import { ApiExceptionFilter } from '../src/common/filters/api-exception.filter';
import { ApiResponseInterceptor } from '../src/common/interceptors/api-response.interceptor';
import { ImageGenerationModule } from '../src/modules/image-generation/image-generation.module';

describe('ImageGenerationController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              IMAGE_STORAGE_PATH: 'F:/temp/ai-images-test',
            }),
          ],
        }),
        ImageGenerationModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new ApiExceptionFilter());
    app.useGlobalInterceptors(new ApiResponseInterceptor());
    await app.init();
  });

  it('/api/image-model-configs (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/image-model-configs')
      .expect(200)
      .expect((response) => {
        const body = response.body as ApiResponse<ImageModelConfig[]>;

        expect(body.code).toBe(ApiResponseCode.Success);
        expect(body.message).toBe('success');
        expect(Array.isArray(body.data)).toBe(true);
        expect(body.data).toHaveLength(2);
      });
  });

  it('/api/image-model-configs/:id (DELETE) returns unified errors', () => {
    return request(app.getHttpServer())
      .delete('/api/image-model-configs/missing')
      .expect(404)
      .expect((response) => {
        const body = response.body as ApiResponse<null>;

        expect(body.code).toBe(ApiResponseCode.NotFound);
        expect(typeof body.message).toBe('string');
        expect(body.data).toBeNull();
      });
  });

  afterEach(async () => {
    await app.close();
  });
});
