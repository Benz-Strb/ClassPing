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
  protected noun = 'รูป';
  protected tooLargeCode = 'IMAGE_TOO_LARGE';
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      catchError((error: unknown) => {
        if (error instanceof AppError) throw error;
        if (error instanceof PayloadTooLargeException) {
          throw new AppError(413, this.tooLargeCode, `${this.noun}ใหญ่เกิน ${this.maxBytes / (1024 * 1024)} MB`);
        }
        if (error instanceof BadRequestException) {
          throw new AppError(400, 'BAD_REQUEST', `ส่ง${this.noun}มาไม่ถูกต้อง`);
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

// หลักฐานการลา: PDF หรือรูป
@Injectable()
export class EvidenceUploadErrorsInterceptor extends UploadErrorsInterceptor {
  protected override maxBytes = MAX_CARD_BYTES;
  protected override noun = 'ไฟล์หลักฐาน';
  protected override tooLargeCode = 'EVIDENCE_TOO_LARGE';
}

// เอกสารอัปโหลด: PDF
@Injectable()
export class DocumentUploadErrorsInterceptor extends UploadErrorsInterceptor {
  protected override maxBytes = 10 * 1024 * 1024;
  protected override noun = 'ไฟล์เอกสาร';
  protected override tooLargeCode = 'DOCUMENT_SIZE';
}
