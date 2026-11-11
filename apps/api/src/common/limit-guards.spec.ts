import type { ExecutionContext } from '@nestjs/common';
import { IDENTITY_LIMIT, IdentityLimitGuard } from '../enrollment/identity-limit.guard.js';
import { TIMETABLE_PREVIEW_LIMIT, TimetablePreviewLimitGuard } from '../timetables/timetable-limit.guard.js';

const as = (id: string) =>
  ({ switchToHttp: () => ({ getRequest: () => ({ user: { id } }) }) }) as unknown as ExecutionContext;

describe.each([
  ['ยืนยันบัตร', IdentityLimitGuard, IDENTITY_LIMIT],
  ['อ่านตารางเรียน', TimetablePreviewLimitGuard, TIMETABLE_PREVIEW_LIMIT],
] as const)('จำกัดจำนวนครั้ง %s', (_name, Guard, limit) => {
  it('เกินขีดจำกัดต่อคนได้ 429 คนอื่นยังใช้ได้ และผ่านใหม่เมื่อหมดช่วง', () => {
    let now = new Date('2026-11-11T03:00:00Z');
    const guard = new Guard(() => now);
    for (let i = 0; i < limit; i++) expect(guard.canActivate(as('a'))).toBe(true);
    expect(() => guard.canActivate(as('a'))).toThrow(expect.objectContaining({ status: 429 }));
    expect(guard.canActivate(as('b'))).toBe(true);
    now = new Date(now.getTime() + 60_001);
    expect(guard.canActivate(as('a'))).toBe(true);
  });
});
