import { describe, expect, it } from 'vitest';
import { outOfRoom, tripSeconds } from './out-of-room.js';

const endsAt = new Date('2026-10-26T04:00:00Z');
const t = (hhmmss: string) => new Date(`2026-10-26T03:${hhmmss}Z`);

// ออก-กลับ ห่างกัน mm:ss
function trip(mm: number, ss: number, startMin = 0) {
  const outAt = new Date(Date.UTC(2026, 9, 26, 2, startMin, 0));
  return { outAt, backAt: new Date(outAt.getTime() + (mm * 60 + ss) * 1000) };
}

describe('outOfRoom', () => {
  it('ไม่มีรอบ = ไม่มีป้าย', () => {
    expect(outOfRoom([], endsAt, 15)).toEqual({ totalSeconds: 0, minutes: 0, label: null });
  });

  it('7:00 + 15:00 เกณฑ์ 15 = 22 นาที เกิน', () => {
    expect(outOfRoom([trip(7, 0), trip(15, 0, 20)], endsAt, 15)).toEqual({
      totalSeconds: 1320,
      minutes: 22,
      label: 'gone',
    });
  });

  it('3 รอบ รอบละ 5:50 รวมก่อนปัด = 17 นาที เกิน', () => {
    const trips = [trip(5, 50), trip(5, 50, 10), trip(5, 50, 20)];
    expect(outOfRoom(trips, endsAt, 15)).toEqual({
      totalSeconds: 1050,
      minutes: 17,
      label: 'gone',
    });
  });

  it('รวม 15:59 ยังไม่เกิน แต่ 16:00 เกิน', () => {
    expect(outOfRoom([trip(15, 59)], endsAt, 15)).toMatchObject({ minutes: 15, label: 'out' });
    expect(outOfRoom([trip(16, 0)], endsAt, 15)).toMatchObject({ minutes: 16, label: 'gone' });
  });

  it('ออกแล้วไม่กลับ นับถึงหมดคาบ ป้ายไม่กลับ', () => {
    const open = { outAt: new Date(endsAt.getTime() - 5 * 60_000), backAt: null };
    expect(outOfRoom([open], endsAt, 15)).toEqual({
      totalSeconds: 300,
      minutes: 5,
      label: 'gone_no_return',
    });
  });

  it('มีรอบไม่กลับรอบเดียวก็ได้ป้ายไม่กลับ แม้รวมไม่เกินเกณฑ์', () => {
    const open = { outAt: new Date(endsAt.getTime() - 60_000), backAt: null };
    expect(outOfRoom([trip(1, 0), open], endsAt, 15).label).toBe('gone_no_return');
  });
});

describe('tripSeconds', () => {
  it('รอบที่กลับแล้ว นับตามจริง', () => {
    expect(tripSeconds({ outAt: t('00:00'), backAt: t('07:30') }, endsAt)).toBe(450);
  });

  it('รอบไม่กลับ นับถึงหมดคาบ ไม่ใช่ตอนนี้', () => {
    expect(tripSeconds({ outAt: t('50:00'), backAt: null }, endsAt)).toBe(600);
  });

  it('ออกหลังหมดคาบ = 0', () => {
    expect(tripSeconds({ outAt: new Date(endsAt.getTime() + 60_000), backAt: null }, endsAt)).toBe(
      0,
    );
  });
});
