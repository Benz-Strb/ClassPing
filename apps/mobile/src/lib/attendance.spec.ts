import { expect, it } from 'vitest';
import { formatBuddhistDate, formatOutOfRoom, formatRate, parseFilterDate } from './attendance';

it('แสดงวันที่เป็น พ.ศ.', () => {
  expect(formatBuddhistDate('2026-11-07')).toBe('7 พ.ย. 2569');
  expect(formatBuddhistDate('ไม่ใช่วันที่')).toBe('ไม่ใช่วันที่');
});

it('ช่องกรองวันที่รับปี พ.ศ. แล้วแปลงเป็น ค.ศ.', () => {
  expect(parseFilterDate('2569-11-07')).toEqual({ ok: true, value: '2026-11-07' });
  expect(parseFilterDate('2026-11-07')).toEqual({ ok: true, value: '2026-11-07' });
  expect(parseFilterDate('  ')).toEqual({ ok: true, value: null });
});

it('ช่องกรองวันที่ปฏิเสธรูปแบบหรือวันที่ที่ไม่มีจริง', () => {
  for (const text of ['07/11/2569', '2569-13-01', '2026-02-30', 'abc']) {
    expect(parseFilterDate(text)).toMatchObject({ ok: false });
  }
});

it('อัตราเป็น - เมื่อยังไม่มีคาบตัดสินผล', () => {
  expect(formatRate({ total: 1, pending: 1 }, 0)).toBe('-');
  expect(formatRate({ total: 2, pending: 0 }, 50)).toBe('50%');
});

it('เวลานอกห้องแสดงเป็นนาที และไม่แสดงเมื่อเป็นศูนย์', () => {
  expect(formatOutOfRoom(0)).toBeNull();
  expect(formatOutOfRoom(30)).toBe('นอกห้อง ไม่ถึง 1 นาที');
  expect(formatOutOfRoom(125)).toBe('นอกห้อง 2 นาที');
});
