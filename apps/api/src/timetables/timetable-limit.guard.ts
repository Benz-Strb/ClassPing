import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../common/clock.js';
import { UserLimitGuard } from '../common/user-limit.guard.js';

export const TIMETABLE_PREVIEW_LIMIT = 10;
export const TIMETABLE_PREVIEW_WINDOW_MS = 60_000;

// อ่านตารางเรียนด้วย OCR ใช้เวลานานและใช้ตัวอ่านร่วมกับใบลา จำกัดต่อผู้ใช้
@Injectable()
export class TimetablePreviewLimitGuard extends UserLimitGuard {
  constructor(@Inject(CLOCK) now: Clock) {
    super(TIMETABLE_PREVIEW_LIMIT, TIMETABLE_PREVIEW_WINDOW_MS, now);
  }
}
