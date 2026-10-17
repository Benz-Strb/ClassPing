import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { AppError } from './app-error.js';

const CODE_BY_STATUS: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
};

interface JsonResponse {
  status(code: number): JsonResponse;
  json(body: unknown): unknown;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<JsonResponse>();

    if (exception instanceof AppError) {
      res
        .status(exception.getStatus())
        .json({ error: { code: exception.code, message: exception.message } });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      res.status(status).json({
        error: {
          code: CODE_BY_STATUS[status] ?? 'HTTP_ERROR',
          message: exception.message,
        },
      });
      return;
    }

    // ไม่รู้จัก: เก็บรายละเอียดไว้ใน log อย่างเดียว ไม่ส่งออกไปให้ client
    this.logger.error(exception);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: { code: 'INTERNAL', message: 'เกิดข้อผิดพลาดภายในระบบ' },
    });
  }
}
