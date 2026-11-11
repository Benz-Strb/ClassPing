import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../common/clock.js';
import { UserLimitGuard } from '../common/user-limit.guard.js';

export const IDENTITY_LIMIT = 10;
export const IDENTITY_WINDOW_MS = 60_000;

// ยืนยันบัตรแต่ละครั้งต้องตรวจหน้าและอ่านบัตรด้วย OCR ซึ่งใช้ร่วมกับใบลาและอ่านทีละงาน
// จำกัดต่อคนไว้ กดซ้ำรัว ๆ จะได้ไม่ทำให้คนอื่นรอ เผื่อรอบที่จัดท่าหน้าไม่ผ่านไว้แล้ว
@Injectable()
export class IdentityLimitGuard extends UserLimitGuard {
  constructor(@Inject(CLOCK) now: Clock) {
    super(IDENTITY_LIMIT, IDENTITY_WINDOW_MS, now);
  }
}
