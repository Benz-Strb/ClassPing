import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { CLOCK, type Clock } from '../common/clock.js';
import { RateLimiter } from '../common/rate-limiter.js';

export const PREVIEW_LIMIT = 10;
export const PREVIEW_WINDOW_MS = 60_000;

// อ่านใบลาด้วย OCR เสียเงินต่อครั้ง จำกัดต่อผู้ใช้ ใช้ทั้งอ่านร่างและยื่นลา นับรวมกัน
@Injectable()
export class PreviewLimitGuard implements CanActivate {
  private readonly limiter: RateLimiter;

  constructor(@Inject(CLOCK) now: Clock) {
    this.limiter = new RateLimiter(PREVIEW_LIMIT, PREVIEW_WINDOW_MS, now);
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ user?: { id: string } }>();
    this.limiter.check(req.user?.id ?? 'unknown');
    return true;
  }
}
