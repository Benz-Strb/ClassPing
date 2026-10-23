import type { AttendanceRepo } from './attendance.repo.js';
import { UnknownCleanupRunner } from './unknown-cleanup.runner.js';

describe('UnknownCleanupRunner', () => {
  it('ลบหน้าที่ไม่รู้จักที่เก่ากว่า 7 วัน ทั้งแถวและไฟล์', async () => {
    const before: Date[] = [];
    const removed: string[][] = [];
    const repo = {
      deleteUnknownBefore: async (date: Date) => {
        before.push(date);
        return ['s1/unknown-1.jpg', 's1/unknown-2.jpg'];
      },
      removeCaptures: async (paths: string[]) => void removed.push(paths),
    } as unknown as AttendanceRepo;
    const runner = new UnknownCleanupRunner(repo, () => new Date('2026-10-23T12:00:00Z'));

    await runner.run();
    expect(before).toEqual([new Date('2026-10-16T12:00:00Z')]);
    expect(removed).toEqual([['s1/unknown-1.jpg', 's1/unknown-2.jpg']]);
  });

  it('ฐานข้อมูลพังไม่ throw ออกไป', async () => {
    const repo = {
      deleteUnknownBefore: async () => {
        throw new Error('db down');
      },
    } as unknown as AttendanceRepo;
    await expect(new UnknownCleanupRunner(repo, () => new Date()).run()).resolves.toBeUndefined();
  });
});
