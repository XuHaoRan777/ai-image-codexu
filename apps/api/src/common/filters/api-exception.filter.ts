import { ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import {
  ApiResponseCode,
  toApiResponseCode,
  type ApiResponse,
} from '@ai-image-codexu/shared';
import type { Response } from 'express';

type HttpExceptionResponse =
  | string
  | {
      message?: string | string[];
      error?: string;
      statusCode?: number;
    };

type ZodIssueLike = {
  message: string;
};

type ZodErrorLike = {
  issues: ZodIssueLike[];
};

@Catch()
export class ApiExceptionFilter {
  /**
   * 将所有异常统一转换为项目 API 响应结构。
   */
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const { code, message } = this.resolveError(exception);
    const payload: ApiResponse<null> = {
      code,
      message,
      data: null,
    };

    response.status(code).json(payload);
  }

  /**
   * 根据异常类型解析响应状态码和错误消息。
   */
  private resolveError(exception: unknown) {
    if (this.isZodErrorLike(exception)) {
      return {
        code: ApiResponseCode.BadRequest,
        message: exception.issues.map((issue) => issue.message).join('; '),
      };
    }

    if (exception instanceof HttpException) {
      const code = toApiResponseCode(exception.getStatus());
      return {
        code,
        message: this.resolveHttpExceptionMessage(exception.getResponse()),
      };
    }

    return {
      code: ApiResponseCode.InternalServerError,
      message: 'Internal server error',
    };
  }

  /**
   * 从 Nest HTTP 异常响应中提取可展示的错误消息。
   */
  private resolveHttpExceptionMessage(response: HttpExceptionResponse) {
    if (typeof response === 'string') {
      return response;
    }

    if (Array.isArray(response.message)) {
      return response.message.join('; ');
    }

    return response.message ?? response.error ?? 'Request failed';
  }

  /**
   * 判断未知异常是否符合 ZodError 的最小结构。
   */
  private isZodErrorLike(exception: unknown): exception is ZodErrorLike {
    if (typeof exception !== 'object' || exception === null) {
      return false;
    }

    const maybeZodError = exception as { issues?: unknown };
    return (
      Array.isArray(maybeZodError.issues) &&
      maybeZodError.issues.every(
        (issue): issue is ZodIssueLike =>
          typeof issue === 'object' &&
          issue !== null &&
          typeof (issue as { message?: unknown }).message === 'string',
      )
    );
  }
}
