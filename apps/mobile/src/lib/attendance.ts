import type { AttendanceCounts } from "./types";

// ยังไม่มีคาบที่ตัดสินผล (ไม่นับรอตรวจ) แสดง - แทน 0%
export function formatRate(
  counts: Pick<AttendanceCounts, "total" | "pending">,
  rate: number,
): string {
  return counts.total - counts.pending > 0 ? `${rate}%` : "-";
}

const MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

// วันที่จาก API (YYYY-MM-DD ค.ศ.) แสดงเป็น พ.ศ. เช่น 7 พ.ย. 2569
export function formatBuddhistDate(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return date;
  return `${Number(match[3])} ${MONTHS[Number(match[2]) - 1] ?? match[2]} ${Number(match[1]) + 543}`;
}

export type FilterDate = { ok: true; value: string | null } | { ok: false; message: string };

// ช่องกรองวันที่: รับ ค.ศ. หรือ พ.ศ. (ปี 2400 ขึ้นไปแปลงเป็น ค.ศ.) ส่งให้ API เป็น ค.ศ. เสมอ
export function parseFilterDate(text: string): FilterDate {
  const raw = text.trim();
  if (!raw) return { ok: true, value: null };
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw);
  const bad = {
    ok: false as const,
    message: "วันที่ต้องเป็นรูปแบบ ปปปป-ดด-วว เช่น 2569-11-07",
  };
  if (!match) return bad;
  let year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year >= 2400) year -= 543;
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return bad;
  }
  return {
    ok: true,
    value: `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  };
}

// วินาทีนอกห้อง -> ข้อความ ไม่แสดงเมื่อเป็นศูนย์ (ต่ำกว่า 1 นาทีแสดงเป็น "ไม่ถึง 1 นาที")
export function formatOutOfRoom(seconds: number): string | null {
  if (!(seconds > 0)) return null;
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `นอกห้อง ${minutes} นาที` : "นอกห้อง ไม่ถึง 1 นาที";
}
