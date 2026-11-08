import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Clock } from './clock.js';
import { RateLimiter } from './rate-limiter.js';

// จำกัดจำนวนครั้งต่อผู้ใช้ที่ login แล้ว แต่ละ guard นับแยกกัน
export abstract class UserLimitGuard implements CanActivate {
  private readonly limiter: RateLimiter;

  protected constructor(limit: number, windowMs: number, now: Clock) {
    this.limiter = new RateLimiter(limit, windowMs, now);
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ user?: { id: string } }>();
    this.limiter.check(req.user?.id ?? 'unknown');
    return true;
  }
}
