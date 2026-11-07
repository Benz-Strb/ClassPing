import type { DoorRepo } from './door.repo.js';
import { OpenTrips } from './open-trips.js';

function setup() {
  let now = new Date('2026-10-23T02:00:00Z');
  const loads: string[] = [];
  const repo = {
    openTripUserIds: async (sessionId: string) => {
      loads.push(sessionId);
      return ['u1'];
    },
  } as unknown as DoorRepo;
  const trips = new OpenTrips(repo, () => now);
  return { trips, loads, tick: (ms: number) => (now = new Date(now.getTime() + ms)) };
}

describe('OpenTrips', () => {
  it('โหลดจากฐานข้อมูลครั้งเดียวใน 60 วินาที', async () => {
    const { trips, loads, tick } = setup();
    expect(await trips.has('s1', 'u1')).toBe(true);
    expect(await trips.has('s1', 'u2')).toBe(false);
    tick(59_000);
    await trips.has('s1', 'u1');
    expect(loads).toEqual(['s1']);
    tick(1_000);
    await trips.has('s1', 'u1');
    expect(loads).toEqual(['s1', 's1']);
  });

  it('add และ remove มีผลทันที', async () => {
    const { trips } = setup();
    await trips.add('s1', 'u2');
    expect(await trips.has('s1', 'u2')).toBe(true);
    await trips.remove('s1', 'u1');
    expect(await trips.has('s1', 'u1')).toBe(false);
  });

  it('แต่ละคาบโหลดแยกกัน', async () => {
    const { trips, loads } = setup();
    await trips.has('s1', 'u1');
    await trips.has('s2', 'u1');
    expect(loads).toEqual(['s1', 's2']);
  });

  it('คาบที่ไม่มีใครเรียกเกิน 60 วินาทีถูกลืม โหลดใหม่เมื่อมีคนถาม', async () => {
    const { trips, loads, tick } = setup();
    await trips.has('s1', 'u1');
    tick(61_000);
    await trips.has('s2', 'u1');
    await trips.has('s1', 'u1');
    expect(loads).toEqual(['s1', 's2', 's1']);
  });
});
