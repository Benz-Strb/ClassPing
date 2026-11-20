import type { ExecutionContext } from '@nestjs/common';
import {
  PREVIEW_LIMIT,
  PreviewLimitGuard,
} from '../leave/preview-limit.guard.js';
import { RateLimiter } from './rate-limiter.js';

let now = new Date('2026-11-07T02:00:00Z');
const clock = () => now;
const ctx = (req: object) =>
  ({ switchToHttp: () => ({ getRequest: () => req }) }) as ExecutionContext;

beforeEach(() => {
  now = new Date('2026-11-07T02:00:00Z');
});

describe('RateLimiter', () => {
  it('เกินขีดจำกัดได้ 429 แล้วผ่านใหม่เมื่อหมดช่วง', () => {
    const limiter = new RateLimiter(2, 60_000, clock);
    limiter.check('a');
    limiter.check('a');
    expect(() => limiter.check('a')).toThrowError(
      expect.objectContaining({ status: 429, code: 'RATE_LIMITED' }),
    );
    limiter.check('b');
    now = new Date(now.getTime() + 60_000);
    limiter.check('a');
  });

  it('ทิ้งคีย์ที่หมดช่วงแล้ว', () => {
    const limiter = new RateLimiter(1, 60_000, clock);
    for (let i = 0; i < 50; i++) limiter.check(`k${i}`);
    now = new Date(now.getTime() + 61_000);
    limiter.check('new');
    expect(
      (limiter as unknown as { hits: Map<string, unknown> }).hits.size,
    ).toBe(1);
  });
});

describe('RateLimiter ตารางเต็ม', () => {
  it('ทิ้งคีย์เก่าสุด คนใหม่ยังผ่าน ไม่โดนล็อก', () => {
    const limiter = new RateLimiter(1, 60_000, clock);
    for (let i = 0; i < 10_000; i++) limiter.check(`k${i}`);
    expect(() => limiter.check('new')).not.toThrow();
    const hits = (limiter as unknown as { hits: Map<string, unknown> }).hits;
    expect(hits.size).toBe(10_000);
    expect(hits.has('k0')).toBe(false);
  });
});

describe('PreviewLimitGuard', () => {
  it('นับต่อผู้ใช้', () => {
    const guard = new PreviewLimitGuard(clock);
    for (let i = 0; i < PREVIEW_LIMIT; i++)
      guard.canActivate(ctx({ user: { id: 'u1' } }));
    expect(() => guard.canActivate(ctx({ user: { id: 'u1' } }))).toThrowError(
      expect.objectContaining({ status: 429 }),
    );
    expect(guard.canActivate(ctx({ user: { id: 'u2' } }))).toBe(true);
  });
});
