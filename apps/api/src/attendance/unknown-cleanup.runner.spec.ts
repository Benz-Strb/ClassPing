import type { AttendanceRepo } from './attendance.repo.js';
import type { DoorRepo } from '../door/door.repo.js';
import { UnknownCleanupRunner } from './unknown-cleanup.runner.js';

function fakeRepo(opts: { failRemove?: boolean } = {}) {
  const calls: string[] = [];
  const before: Date[] = [];
  const repo = {
    unknownBefore: async (date: Date) => {
      before.push(date);
      return [
        { id: 'x1', imagePath: 's1/unknown-1.jpg' },
        { id: 'x2', imagePath: 's1/unknown-2.jpg' },
      ];
    },
    removeCaptures: async (paths: string[]) => {
      if (opts.failRemove) throw new Error('storage down');
      calls.push(`files ${paths.join(',')}`);
    },
    deleteUnknown: async (ids: string[]) => void calls.push(`rows ${ids.join(',')}`),
  } as unknown as AttendanceRepo;
  const tripBefore: Date[] = [];
  const doorRepo = {
    unknownTripsBefore: async (date: Date) => {
      tripBefore.push(date);
      return [
        { id: 't1', imagePath: 's1/door-unknown-1.jpg' },
        { id: 't2', imagePath: null },
      ];
    },
    deleteTrips: async (ids: string[]) => void calls.push(`trips ${ids.join(',')}`),
  } as unknown as DoorRepo;
  return { repo, doorRepo, calls, before, tripBefore };
}

describe('UnknownCleanupRunner', () => {
  it('ลบไฟล์ก่อนแล้วค่อยลบแถว ของที่เก่ากว่า 7 วัน', async () => {
    const { repo, doorRepo, calls, before } = fakeRepo();
    await new UnknownCleanupRunner(repo, doorRepo, () => new Date('2026-10-23T12:00:00Z')).run();
    expect(before).toEqual([new Date('2026-10-16T12:00:00Z')]);
    expect(calls.slice(0, 2)).toEqual(['files s1/unknown-1.jpg,s1/unknown-2.jpg', 'rows x1,x2']);
  });

  it('รอบออกนอกห้องที่ไม่รู้ว่าใครเก่ากว่า 7 วัน ถูกลบพร้อมรูป (ที่มีรูป)', async () => {
    const { repo, doorRepo, calls, tripBefore } = fakeRepo();
    await new UnknownCleanupRunner(repo, doorRepo, () => new Date('2026-10-23T12:00:00Z')).run();
    expect(tripBefore).toEqual([new Date('2026-10-16T12:00:00Z')]);
    expect(calls.slice(2)).toEqual(['files s1/door-unknown-1.jpg', 'trips t1,t2']);
  });

  it('ลบไฟล์ไม่สำเร็จ แถวยังอยู่ให้รอบหน้าลองใหม่ และไม่ throw ออกไป', async () => {
    const { repo, doorRepo, calls } = fakeRepo({ failRemove: true });
    await expect(
      new UnknownCleanupRunner(repo, doorRepo, () => new Date()).run(),
    ).resolves.toBeUndefined();
    expect(calls).toEqual([]);
  });
});
