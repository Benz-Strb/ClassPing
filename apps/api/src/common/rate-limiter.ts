import { AppError } from './app-error.js';
import type { Clock } from './clock.js';

// ตัวนับต่อช่วงเวลาในหน่วยความจำ ใช้กับ endpoint ที่เรียกบริการเสียเงิน
// นับแยกต่อเครื่อง API ถ้ารันหลายเครื่องจะได้ขีดจำกัดเครื่องละเท่า ๆ กัน
const MAX_KEYS = 10_000;

export class RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();
  private lastSweep = 0;

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: Clock,
  ) {}

  // เกินขีดจำกัดโยน 429
  check(key: string): void {
    const t = this.now().getTime();
    this.sweep(t);
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= t) {
      if (!entry && this.hits.size >= MAX_KEYS) throw tooMany();
      this.hits.set(key, { count: 1, resetAt: t + this.windowMs });
      return;
    }
    if (entry.count >= this.limit) throw tooMany();
    entry.count += 1;
  }

  // ทิ้งคีย์ที่หมดช่วงแล้ว ทำอย่างมากหนึ่งครั้งต่อช่วง
  private sweep(t: number) {
    if (t - this.lastSweep < this.windowMs && this.hits.size < MAX_KEYS) return;
    this.lastSweep = t;
    for (const [key, entry] of this.hits) {
      if (entry.resetAt <= t) this.hits.delete(key);
    }
  }
}

function tooMany() {
  return new AppError(
    429,
    'RATE_LIMITED',
    'ส่งคำขอถี่เกินไป รอสักครู่แล้วลองใหม่',
  );
}
