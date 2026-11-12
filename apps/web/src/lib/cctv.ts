// ตัวช่วยของตัวเล่นกล้องวงจรปิด: ช่วงที่มีภาพอัด แถบเวลา และเวลาไทย (ทุกค่าเป็นมิลลิวินาที epoch)

export type Span = { from: number; to: number };

// ลากไปใกล้ปลายแถบไม่เกินนี้ ถือว่ากลับไปดูสด (ภาพอัดช้ากว่าสดราว 1-2 วิ)
export const LIVE_EDGE_MS = 5000;
const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

export function toSpans(segments: { start: string; duration: number }[]): Span[] {
  return segments
    .map((s) => {
      const from = Date.parse(s.start);
      return { from, to: from + s.duration * 1000 };
    })
    .sort((a, b) => a.from - b.from);
}

// ช่วงที่มีภาพ ณ เวลา t
export function spanAt(spans: Span[], t: number): Span | null {
  return spans.find((s) => t >= s.from && t < s.to) ?? null;
}

// ช่องว่างระหว่างสองช่วง (กล้องหลุด) ที่ t อยู่
export function gapAt(spans: Span[], t: number): Span | null {
  for (let i = 0; i < spans.length - 1; i++) {
    if (t >= spans[i].to && t < spans[i + 1].from) return { from: spans[i].to, to: spans[i + 1].from };
  }
  return null;
}

// แถบเวลาเริ่มที่ต้นคาบ หรือภาพแรกถ้ากล้องเปิดก่อนคาบ จบที่หมดคาบ
export function timelineRange(startsAt: number, endsAt: number, spans: Span[][]): Span {
  const first = Math.min(...spans.flat().map((s) => s.from), startsAt);
  return { from: first, to: Math.max(endsAt, first + MINUTE_MS) };
}

// ขีดบอกเวลาบนแถบ ถี่ตามความยาวคาบ ตรงกับนาทีกลม ๆ ของเวลาไทย
export function ticks(range: Span): number[] {
  const length = range.to - range.from;
  const step = (length <= HOUR_MS ? 10 : length <= 4 * HOUR_MS ? 30 : 60) * MINUTE_MS;
  const list: number[] = [];
  for (let t = Math.ceil(range.from / step) * step; t <= range.to; t += step) list.push(t);
  return list;
}

// HH:mm:ss เวลาไทย
export function clock(ms: number): string {
  return new Date(ms + 7 * HOUR_MS).toISOString().slice(11, 19);
}

export function behindText(ms: number): string {
  return ms < MINUTE_MS
    ? `ช้ากว่าสด ${Math.round(ms / 1000)} วินาที`
    : `ช้ากว่าสด ${Math.floor(ms / MINUTE_MS)} นาที`;
}
