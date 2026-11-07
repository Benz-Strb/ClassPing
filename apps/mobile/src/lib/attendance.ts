import type { AttendanceCounts } from "./types";

// ยังไม่มีคาบที่ตัดสินผล (ไม่นับรอตรวจ) แสดง - แทน 0%
export function formatRate(
  counts: Pick<AttendanceCounts, "total" | "pending">,
  rate: number,
): string {
  return counts.total - counts.pending > 0 ? `${rate}%` : "-";
}
