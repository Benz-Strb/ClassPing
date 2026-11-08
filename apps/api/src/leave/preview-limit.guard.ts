import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../common/clock.js';
import { UserLimitGuard } from '../common/user-limit.guard.js';

export const PREVIEW_LIMIT = 10;
export const PREVIEW_WINDOW_MS = 60_000;
export const SUBMIT_LIMIT = 10;

// อ่านใบลาด้วย OCR เสียเงินต่อครั้ง จำกัดต่อผู้ใช้
// หน้าลาอ่านร่างเองทุกครั้งที่เลือกไฟล์ จึงแยกเพดานการยื่นลาไว้ เลือกไฟล์หลายรอบแล้วยังกดส่งได้
@Injectable()
export class PreviewLimitGuard extends UserLimitGuard {
  constructor(@Inject(CLOCK) now: Clock) {
    super(PREVIEW_LIMIT, PREVIEW_WINDOW_MS, now);
  }
}

@Injectable()
export class SubmitLimitGuard extends UserLimitGuard {
  constructor(@Inject(CLOCK) now: Clock) {
    super(SUBMIT_LIMIT, PREVIEW_WINDOW_MS, now);
  }
}
