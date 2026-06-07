import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { json, urlencoded } from 'express';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import { ApiResponseInterceptor } from './common/interceptors/api-response.interceptor';

/**
 * 启动 Nest 应用并注册全局前缀、跨域、异常过滤器和响应拦截器。
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  // 获取配置服务
  const configService = app.get(ConfigService);
  const defaultPort = 3011;
  const prot = Number(configService.get('PORT')) || defaultPort;
  app.use(json({ limit: '30mb' }));
  app.use(urlencoded({ extended: true, limit: '30mb' }));
  // 配置跨域
  app.enableCors();
  // 全局路由前缀
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalInterceptors(new ApiResponseInterceptor());

  // 启动失败重启net服务
  // net stop winnat
  // net start winnat
  await app.listen(prot);
}
void bootstrap();
