import { HttpException } from '@nestjs/common';

// error ที่ตั้งใจส่งให้หน้าเว็บ/แอปอ่าน code ไปแสดงผลต่อได้
export class AppError extends HttpException {
  constructor(
    status: number,
    readonly code: string,
    message: string,
  ) {
    super(message, status);
  }
}
