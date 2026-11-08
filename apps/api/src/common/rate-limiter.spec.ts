import type { ExecutionContext } from '@nestjs/common';
import {
  PUBLIC_CHAT_LIMIT,
  PUBLIC_CHAT_TOTAL_LIMIT,
  PublicChatLimitGuard,
} from '../chat/public-chat.guard.js';
import {
  PREVIEW_LIMIT,
  PreviewLimitGuard,
} from '../leave/preview-limit.guard.js';
import { STUDY_CHAT_LIMIT, StudyChatLimitGuard } from '../chat/study-chat.guard.js';
import { ipKey, RateLimiter } from './rate-limiter.js';

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

describe('ipKey', () => {
  it.each([
    ['1.2.3.4', '1.2.3.4'],
    ['::ffff:1.2.3.4', '1.2.3.4'],
    ['2001:db8:1:2:aaaa:bbbb:cccc:dddd', '2001:db8:1:2::/64'],
    ['2001:db8:1:2:1111:2222:3333:4444', '2001:db8:1:2::/64'],
    ['2001:0db8::1', '2001:db8:0:0::/64'],
    ['::1', '0:0:0:0::/64'],
    ['fe80::1%en0', 'fe80:0:0:0::/64'],
  ])('%s เป็น %s', (ip, key) => {
    expect(ipKey(ip)).toBe(key);
  });

  it('ไม่มี IP นับรวมกันเป็น unknown', () => {
    expect(ipKey(undefined)).toBe('unknown');
  });
});

describe('PublicChatLimitGuard เพดานรวม', () => {
  it('หลาย IP รวมกันเกินเพดานได้ 429 แล้วผ่านใหม่เมื่อหมดช่วง', () => {
    const guard = new PublicChatLimitGuard(clock);
    for (let i = 0; i < PUBLIC_CHAT_TOTAL_LIMIT; i++) {
      guard.canActivate(ctx({ ip: `10.0.${Math.floor(i / 250)}.${i % 250}` }));
    }
    expect(() => guard.canActivate(ctx({ ip: '11.0.0.1' }))).toThrowError(
      expect.objectContaining({ status: 429 }),
    );
    now = new Date(now.getTime() + 60_000);
    expect(guard.canActivate(ctx({ ip: '11.0.0.1' }))).toBe(true);
  });
});

describe('PublicChatLimitGuard', () => {
  it('นับต่อ IP และไม่เชื่อ X-Forwarded-For', () => {
    const guard = new PublicChatLimitGuard(clock);
    const req = (ip: string) => ({
      ip,
      headers: { 'x-forwarded-for': `9.9.9.${Math.random()}` },
    });
    for (let i = 0; i < PUBLIC_CHAT_LIMIT; i++)
      guard.canActivate(ctx(req('1.1.1.1')));
    expect(() => guard.canActivate(ctx(req('1.1.1.1')))).toThrowError(
      expect.objectContaining({ status: 429 }),
    );
    expect(guard.canActivate(ctx(req('2.2.2.2')))).toBe(true);
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

describe('StudyChatLimitGuard', () => {
  it('ผู้ช่วยเรียนนับต่อผู้ใช้ เกินเพดานได้ 429 แล้วผ่านใหม่เมื่อหมดช่วง', () => {
    const guard = new StudyChatLimitGuard(clock);
    for (let i = 0; i < STUDY_CHAT_LIMIT; i++) guard.canActivate(ctx({ user: { id: 'u1' } }));
    expect(() => guard.canActivate(ctx({ user: { id: 'u1' } }))).toThrowError(
      expect.objectContaining({ status: 429, code: 'RATE_LIMITED' }),
    );
    expect(guard.canActivate(ctx({ user: { id: 'u2' } }))).toBe(true);
    now = new Date(now.getTime() + 60_000);
    expect(guard.canActivate(ctx({ user: { id: 'u1' } }))).toBe(true);
  });
});
