import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { CLOCK, type Clock } from '../common/clock.js';
import { RateLimiter } from '../common/rate-limiter.js';

export const PUBLIC_CHAT_LIMIT = 20;
export const PUBLIC_CHAT_WINDOW_MS = 60_000;

// แชตสาธารณะไม่ต้อง login จำกัดต่อ IP ใช้ req.ip ไม่อ่าน X-Forwarded-For เอง
// ถ้าวางหลัง proxy ต้องตั้ง trust proxy ของ Express ไม่งั้นทุกคนจะนับเป็น IP เดียวกัน
@Injectable()
export class PublicChatLimitGuard implements CanActivate {
  private readonly limiter: RateLimiter;

  constructor(@Inject(CLOCK) now: Clock) {
    this.limiter = new RateLimiter(
      PUBLIC_CHAT_LIMIT,
      PUBLIC_CHAT_WINDOW_MS,
      now,
    );
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ ip?: string }>();
    this.limiter.check(req.ip ?? 'unknown');
    return true;
  }
}
