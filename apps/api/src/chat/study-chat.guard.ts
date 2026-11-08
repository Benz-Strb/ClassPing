import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../common/clock.js';
import { UserLimitGuard } from '../common/user-limit.guard.js';

export const STUDY_CHAT_LIMIT = 20;
export const STUDY_CHAT_WINDOW_MS = 60_000;

// ผู้ช่วยเรียนเรียก Gemini กับ Google Search ทุกคำถาม จำกัดต่อผู้ใช้ กันโควตาหมด
@Injectable()
export class StudyChatLimitGuard extends UserLimitGuard {
  constructor(@Inject(CLOCK) now: Clock) {
    super(STUDY_CHAT_LIMIT, STUDY_CHAT_WINDOW_MS, now);
  }
}
