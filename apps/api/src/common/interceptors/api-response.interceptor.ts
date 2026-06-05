import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { toApiResponseCode, type ApiResponse } from '@ai-image-codexu/shared';
import { map, type Observable } from 'rxjs';

@Injectable()
export class ApiResponseInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<T>
> {
  /**
   * 将普通 controller 返回值包装为统一 API 响应结构。
   */
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T>> {
    const response = context
      .switchToHttp()
      .getResponse<{ statusCode: number }>();

    return next.handle().pipe(
      map((data) => {
        if (Buffer.isBuffer(data)) {
          return data as unknown as ApiResponse<T>;
        }

        return {
          code: toApiResponseCode(response.statusCode),
          message: 'success',
          data,
        };
      }),
    );
  }
}
