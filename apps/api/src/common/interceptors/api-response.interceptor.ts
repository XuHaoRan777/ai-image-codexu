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
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T>> {
    const response = context
      .switchToHttp()
      .getResponse<{ statusCode: number }>();

    return next.handle().pipe(
      map((data) => ({
        code: toApiResponseCode(response.statusCode),
        message: 'success',
        data,
      })),
    );
  }
}
