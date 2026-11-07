import { describe, expect, it } from 'vitest';
import { inSession, outOfRoom, tripSeconds } from './out-of-room.js';

const startsAt = new Date('2026-10-26T01:00:00Z');
const endsAt = new Date('2026-10-26T04:00:00Z');
const t = (hhmmss: string) => new Date(`2026-10-26T03:${hhmmss}Z`);

// ออก-กลับ ห่างกัน mm:ss
function trip(mm: number, ss: number, startMin = 0) {
  const outAt = new Date(Date.UTC(2026, 9, 26, 2, startMin, 0));
  return { outAt, backAt: new Date(outAt.getTime() + (mm * 60 + ss) * 1000) };
}

describe('outOfRoom', () => {
  it('ไม่มีรอบ = ไม่มีป้าย', () => {
    expect(outOfRoom([], startsAt, endsAt, 15, endsAt)).toEqual({
      totalSeconds: 0,
      minutes: 0,
      label: null,
    });
  });

  it('7:00 + 15:00 เกณฑ์ 15 = 22 นาที เกิน', () => {
    expect(outOfRoom([trip(7, 0), trip(15, 0, 20)], startsAt, endsAt, 15, endsAt)).toEqual({
      totalSeconds: 1320,
      minutes: 22,
      label: 'gone',
    });
  });

  it('3 รอบ รอบละ 5:50 รวมก่อนปัด = 17 นาที เกิน', () => {
    const trips = [trip(5, 50), trip(5, 50, 10), trip(5, 50, 20)];
    expect(outOfRoom(trips, startsAt, endsAt, 15, endsAt)).toEqual({
      totalSeconds: 1050,
      minutes: 17,
      label: 'gone',
    });
  });

  it('รวม 15:59 ยังไม่เกิน แต่ 16:00 เกิน', () => {
    expect(outOfRoom([trip(15, 59)], startsAt, endsAt, 15, endsAt)).toMatchObject({
      minutes: 15,
      label: 'out',
    });
    expect(outOfRoom([trip(16, 0)], startsAt, endsAt, 15, endsAt)).toMatchObject({
      minutes: 16,
      label: 'gone',
    });
  });

  it('ออกแล้วไม่กลับ นับถึงหมดคาบ ป้ายไม่กลับ', () => {
    const open = { outAt: new Date(endsAt.getTime() - 5 * 60_000), backAt: null };
    expect(outOfRoom([open], startsAt, endsAt, 15, endsAt)).toEqual({
      totalSeconds: 300,
      minutes: 5,
      label: 'gone_no_return',
    });
  });

  it('มีรอบไม่กลับรอบเดียวก็ได้ป้ายไม่กลับ แม้รวมไม่เกินเกณฑ์', () => {
    const open = { outAt: new Date(endsAt.getTime() - 60_000), backAt: null };
    expect(outOfRoom([trip(1, 0), open], startsAt, endsAt, 15, endsAt).label).toBe(
      'gone_no_return',
    );
  });
});

// รอบที่ยังไม่กลับระหว่างคาบ นับถึงตอนนี้ ยังไม่ใช่ไม่กลับ
describe('รอบที่ยังไม่กลับระหว่างคาบ', () => {
  const start = new Date('2026-10-26T02:00:00Z');
  const end = new Date('2026-10-26T05:00:00Z');
  const at = (h: number, m: number, s = 0) => new Date(Date.UTC(2026, 9, 26, h, m, s));

  it('ออกได้ 5 วินาที ป้ายออกอยู่ ไม่ใช่ไม่กลับ', () => {
    const open = { outAt: at(2, 0, 0), backAt: null };
    expect(outOfRoom([open], start, end, 15, at(2, 0, 5))).toEqual({
      totalSeconds: 5,
      minutes: 0,
      label: 'out_now',
    });
  });

  it('เกินเกณฑ์ระหว่างคาบ ป้ายหาย นับถึงตอนนี้', () => {
    const open = { outAt: at(2, 0), backAt: null };
    expect(outOfRoom([open], start, end, 15, at(2, 20, 30))).toEqual({
      totalSeconds: 1230,
      minutes: 20,
      label: 'gone',
    });
  });

  it('พอดีเกณฑ์ยังเป็นออกอยู่', () => {
    const open = { outAt: at(2, 0), backAt: null };
    expect(outOfRoom([open], start, end, 15, at(2, 15, 59)).label).toBe('out_now');
  });

  it('ตอนนี้ตรงกับหมดคาบพอดี = ไม่กลับ', () => {
    const open = { outAt: at(4, 55), backAt: null };
    expect(outOfRoom([open], start, end, 15, end)).toEqual({
      totalSeconds: 300,
      minutes: 5,
      label: 'gone_no_return',
    });
  });

  it('ตอนนี้หลังหมดคาบ นับถึงหมดคาบเท่านั้น', () => {
    const open = { outAt: at(4, 55), backAt: null };
    expect(outOfRoom([open], start, end, 15, at(6, 0))).toEqual({
      totalSeconds: 300,
      minutes: 5,
      label: 'gone_no_return',
    });
    expect(tripSeconds(open, start, end, at(6, 0))).toBe(300);
  });

  it('รอบที่กลับแล้วรวมกับรอบที่ยังไม่กลับ', () => {
    const closed = { outAt: at(2, 10), backAt: at(2, 18) };
    const open = { outAt: at(3, 0), backAt: null };
    expect(outOfRoom([closed, open], start, end, 15, at(3, 4, 30))).toEqual({
      totalSeconds: 480 + 270,
      minutes: 12,
      label: 'out_now',
    });
    expect(outOfRoom([closed, open], start, end, 15, at(3, 10))).toMatchObject({
      minutes: 18,
      label: 'gone',
    });
  });

  it('รอบที่กลับแล้วไม่ขึ้นกับตอนนี้', () => {
    const closed = { outAt: at(2, 10), backAt: at(2, 18) };
    expect(outOfRoom([closed], start, end, 15, at(2, 30))).toMatchObject({ label: 'out' });
    expect(tripSeconds(closed, start, end, at(2, 12))).toBe(480);
  });

  it('คาบยังไม่เริ่ม ไม่ติดลบ', () => {
    const open = { outAt: at(1, 50), backAt: null };
    expect(tripSeconds(open, start, end, at(1, 55))).toBe(0);
    expect(outOfRoom([open], start, end, 15, at(1, 55))).toEqual({
      totalSeconds: 0,
      minutes: 0,
      label: 'out_now',
    });
    expect(tripSeconds({ outAt: at(2, 0), backAt: null }, start, end, at(1, 0))).toBe(0);
  });
});

describe('tripSeconds', () => {
  it('รอบที่กลับแล้ว นับตามจริง', () => {
    expect(tripSeconds({ outAt: t('00:00'), backAt: t('07:30') }, startsAt, endsAt, endsAt)).toBe(
      450,
    );
  });

  it('รอบไม่กลับ หลังหมดคาบนับถึงหมดคาบ', () => {
    expect(tripSeconds({ outAt: t('50:00'), backAt: null }, startsAt, endsAt, endsAt)).toBe(600);
  });

  it('ออกหลังหมดคาบ = 0', () => {
    expect(
      tripSeconds(
        { outAt: new Date(endsAt.getTime() + 60_000), backAt: null },
        startsAt,
        endsAt,
        endsAt,
      ),
    ).toBe(0);
  });
});

// คาบเริ่ม 09:00 (02:00Z) ออกก่อนคาบเริ่มนับเฉพาะส่วนที่อยู่ในคาบ
describe('นับเฉพาะเวลาในคาบ', () => {
  const start = new Date('2026-10-26T02:00:00Z');
  const end = new Date('2026-10-26T04:00:00Z');
  const at = (h: number, m: number) => new Date(Date.UTC(2026, 9, 26, h, m, 0));

  it('ออกก่อนคาบ กลับระหว่างคาบ นับจากเริ่มคาบ', () => {
    const trips = [{ outAt: at(1, 55), backAt: at(2, 10) }];
    expect(tripSeconds(trips[0], start, end, end)).toBe(600);
    expect(outOfRoom(trips, start, end, 15, end)).toEqual({
      totalSeconds: 600,
      minutes: 10,
      label: 'out',
    });
  });

  it('ออกก่อนคาบ ไม่กลับ นับจากเริ่มคาบถึงหมดคาบ ป้ายไม่กลับ', () => {
    const trips = [{ outAt: at(1, 0), backAt: null }];
    expect(outOfRoom(trips, start, end, 15, end)).toEqual({
      totalSeconds: 7200,
      minutes: 120,
      label: 'gone_no_return',
    });
  });

  it('ออกและกลับก่อนคาบเริ่ม ไม่นับ ไม่มีป้าย และไม่แสดง', () => {
    const before = { outAt: at(1, 0), backAt: at(1, 50) };
    expect(tripSeconds(before, start, end, end)).toBe(0);
    expect(inSession([before], start)).toEqual([]);
    expect(outOfRoom([before], start, end, 15, end)).toEqual({
      totalSeconds: 0,
      minutes: 0,
      label: null,
    });
  });

  it('กลับตรงเวลาเริ่มคาบพอดี = อยู่นอกคาบ', () => {
    const edge = { outAt: at(1, 50), backAt: at(2, 0) };
    expect(inSession([edge], start)).toEqual([]);
    expect(outOfRoom([edge], start, end, 15, end).label).toBeNull();
  });

  it('รอบนอกคาบไม่ทำให้ป้ายเปลี่ยน และไม่ถูกรวม', () => {
    const before = { outAt: at(1, 0), backAt: at(1, 50) };
    const inside = { outAt: at(2, 10), backAt: at(2, 20) };
    expect(inSession([before, inside], start)).toEqual([inside]);
    expect(outOfRoom([before, inside], start, end, 15, end)).toEqual({
      totalSeconds: 600,
      minutes: 10,
      label: 'out',
    });
  });

  it('รอบในคาบทั้งรอบ ผลเหมือนเดิม', () => {
    const inside = { outAt: at(2, 10), backAt: at(2, 40) };
    expect(tripSeconds(inside, start, end, end)).toBe(1800);
    expect(outOfRoom([inside], start, end, 15, end)).toMatchObject({ minutes: 30, label: 'gone' });
  });
});
