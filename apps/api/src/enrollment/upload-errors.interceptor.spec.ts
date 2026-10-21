import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, throwError } from 'rxjs';
import { AppError } from '../common/app-error.js';
import { UploadErrorsInterceptor } from './upload-errors.interceptor.js';

async function mapped(error: Error) {
  const next: CallHandler = { handle: () => throwError(() => error) };
  try {
    await firstValueFrom(
      new UploadErrorsInterceptor().intercept({} as ExecutionContext, next),
    );
  } catch (e) {
    return e;
  }
  throw new Error('คาดว่าจะ throw แต่ไม่ throw');
}

describe('UploadErrorsInterceptor', () => {
  it('ไฟล์ใหญ่เกินได้ 413 IMAGE_TOO_LARGE ข้อความไทย', async () => {
    const e = (await mapped(new PayloadTooLargeException('File too large'))) as AppError;
    expect(e.getStatus()).toBe(413);
    expect(e.code).toBe('IMAGE_TOO_LARGE');
    expect(e.message).toBe('รูปใหญ่เกิน 5 MB');
  });

  it('error อื่นของ multer ได้ 400 ข้อความไทย', async () => {
    const e = (await mapped(new BadRequestException('Unexpected field'))) as AppError;
    expect(e.getStatus()).toBe(400);
    expect(e.message).toBe('ส่งรูปมาไม่ถูกต้อง');
  });

  it('AppError ส่งต่อตามเดิม', async () => {
    const original = new AppError(422, 'MULTIPLE_FACES', 'มีหลายคนในรูป');
    expect(await mapped(original)).toBe(original);
  });
});
