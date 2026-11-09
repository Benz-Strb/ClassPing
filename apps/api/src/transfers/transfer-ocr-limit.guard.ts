import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../common/clock.js';
import { UserLimitGuard } from '../common/user-limit.guard.js';

export const TRANSFER_OCR_LIMIT = 10;
export const TRANSFER_OCR_WINDOW_MS = 60_000;

// เอกสารเทียบโอนอ่านได้ถึง 100 หน้าต่อไฟล์ และใช้บริการ OCR ตัวเดียวกับใบลา จำกัดต่อผู้ใช้
@Injectable()
export class TransferOcrLimitGuard extends UserLimitGuard {
  constructor(@Inject(CLOCK) now: Clock) {
    super(TRANSFER_OCR_LIMIT, TRANSFER_OCR_WINDOW_MS, now);
  }
}
