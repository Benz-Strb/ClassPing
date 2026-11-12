import { describe, expect, it } from 'vitest';
import { behindText, clock, gapAt, spanAt, ticks, timelineRange, toSpans } from './cctv';

const at = (hhmm: string) => Date.parse(`2026-11-11T${hhmm}:00+07:00`);

describe('cctv', () => {
  const spans = toSpans([
    { start: '2026-11-11T02:49:30.000Z', duration: 600 },
    { start: '2026-11-11T02:00:00.000Z', duration: 47 * 60 },
  ]);

  it('เรียงช่วงตามเวลาและหาช่วงที่มีภาพ', () => {
    expect(spans[0].from).toBe(at('09:00'));
    expect(spanAt(spans, at('09:10'))).toBe(spans[0]);
    expect(spanAt(spans, at('09:48'))).toBeNull();
    expect(spanAt(spans, spans[0].to)).toBeNull();
  });

  it('บอกช่วงที่กล้องหลุด', () => {
    expect(gapAt(spans, at('09:48'))).toEqual({ from: at('09:47'), to: spans[1].from });
    expect(gapAt(spans, at('09:10'))).toBeNull();
    expect(gapAt(spans, at('11:00'))).toBeNull();
  });

  it('แถบเวลาเริ่มที่ภาพแรกถ้ากล้องเปิดก่อนคาบ', () => {
    expect(timelineRange(at('09:05'), at('12:00'), [spans, []])).toEqual({ from: at('09:00'), to: at('12:00') });
    expect(timelineRange(at('09:00'), at('12:00'), [[]])).toEqual({ from: at('09:00'), to: at('12:00') });
  });

  it('ขีดเวลาทุก 30 นาทีสำหรับคาบ 3 ชั่วโมง ตรงนาทีกลมของเวลาไทย', () => {
    const list = ticks({ from: at('09:05'), to: at('12:00') });
    expect(list.map(clock)).toEqual(['09:30:00', '10:00:00', '10:30:00', '11:00:00', '11:30:00', '12:00:00']);
    expect(ticks({ from: at('09:00'), to: at('10:00') })).toHaveLength(7);
  });

  it('บอกว่าช้ากว่าสดเท่าไร', () => {
    expect(behindText(12_400)).toBe('ช้ากว่าสด 12 วินาที');
    expect(behindText(5 * 60_000 + 59_000)).toBe('ช้ากว่าสด 5 นาที');
  });
});
