import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  PayloadTooLargeException,
} from '@nestjs/common';
import { catchError, type Observable } from 'rxjs';
import { AppError } from '../common/app-error.js';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_CARD_BYTES = 25 * 1024 * 1024;

// error จาก multer เป็นภาษาอังกฤษ แปลงเป็นข้อความที่แอปเอาไปแสดงได้
// ต้องวางไว้ก่อน FileInterceptor ใน @UseInterceptors
@Injectable()
export class UploadErrorsInterceptor implements NestInterceptor {
  protected maxBytes = MAX_IMAGE_BYTES;
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      catchError((error: unknown) => {
        if (error instanceof AppError) throw error;
        if (error instanceof PayloadTooLargeException) {
          throw new AppError(413, 'IMAGE_TOO_LARGE', `รูปใหญ่เกิน ${this.maxBytes / (1024 * 1024)} MB`);
        }
        if (error instanceof BadRequestException) {
          throw new AppError(400, 'BAD_REQUEST', 'ส่งรูปมาไม่ถูกต้อง');
        }
        throw error;
      }),
    );
  }
}

@Injectable()
export class CardUploadErrorsInterceptor extends UploadErrorsInterceptor {
  protected override maxBytes = MAX_CARD_BYTES;
}
