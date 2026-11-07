const OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const TZ = "Asia/Bangkok";

export const WEEKDAYS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];

export function bangkokDate(now: Date): string {
  return new Date(now.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

export function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

export function formatDate(date: string): string {
  return new Date(`${date}T12:00:00+07:00`).toLocaleDateString("th-TH", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: TZ,
  });
}

export function formatTime(iso: string): string {
  return new Date(new Date(iso).getTime() + OFFSET_MS).toISOString().slice(11, 16);
}

// เวลา HH:mm (เวลาไทย) ของคาบ -> ISO มี offset คาบที่ข้ามเที่ยงคืนและเวลาน้อยกว่าเวลาเริ่ม = วันถัดไป
export function bangkokTimeToIso(
  onDate: string,
  hhmm: string,
  startsAt: string,
  endsAt: string,
): string {
  let ms = Date.parse(`${onDate}T${hhmm}:00+07:00`);
  if (bangkokDate(new Date(endsAt)) > onDate && ms < Date.parse(startsAt)) ms += DAY_MS;
  return new Date(ms).toISOString();
}

// เวลากลับที่จะส่ง: ไม่ได้แก้เวลา (HH:mm ตรงกับค่าเดิม) ใช้ค่าเดิมทั้งวินาที แก้แล้วค่อยแปลงจาก HH:mm
export function chooseBackAt(
  original: string | null,
  hhmm: string,
  session: { onDate: string; startsAt: string; endsAt: string },
): string {
  if (original && formatTime(original) === hhmm) return original;
  return bangkokTimeToIso(session.onDate, hhmm, session.startsAt, session.endsAt);
}
