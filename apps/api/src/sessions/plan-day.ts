// คำนวณคาบเรียนของแต่ละวันตามเวลาไทย
// ไทยใช้ UTC+7 ตลอดปี (ไม่มี daylight saving) จึงใช้ค่าคงที่ได้
// ห้ามใช้ Date แบบเวลาเครื่อง เครื่องที่รันจะตั้ง timezone อะไรก็ต้องได้ผลเดียวกัน

export const TZ_OFFSET = '+07:00';
const OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ScheduleLike {
  id: string;
  courseId: string;
  // 0 = อาทิตย์ ... 6 = เสาร์
  weekday: number;
  startTime: string;
  endTime: string;
  roomId: string;
}

// ค่า null แปลว่าใช้ค่าเดิมของตารางประจำ
export interface OverrideLike {
  scheduleId: string;
  onDate: string;
  cancelled: boolean;
  roomId: string | null;
  startTime: string | null;
  endTime: string | null;
}

export interface PlannedSession {
  scheduleId: string;
  courseId: string;
  roomId: string;
  onDate: string;
  startsAt: Date;
  endsAt: Date;
}

// วันที่ 'YYYY-MM-DD' ตามเวลาไทย
export function bangkokDate(now: Date): string {
  return new Date(now.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

export function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

// time เป็น 'HH:MM' หรือ 'HH:MM:SS' (แบบที่ Postgres ส่งคอลัมน์ time มา)
export function toInstant(date: string, time: string): Date {
  const hhmmss = time.length === 5 ? `${time}:00` : time;
  return new Date(`${date}T${hhmmss}${TZ_OFFSET}`);
}

export function planDay(
  date: string,
  schedules: ScheduleLike[],
  overrides: OverrideLike[],
): PlannedSession[] {
  const weekday = weekdayOf(date);
  const sessions: PlannedSession[] = [];

  for (const schedule of schedules) {
    if (schedule.weekday !== weekday) continue;
    const change = overrides.find(
      (o) => o.scheduleId === schedule.id && o.onDate === date,
    );
    if (change?.cancelled) continue;

    sessions.push({
      scheduleId: schedule.id,
      courseId: schedule.courseId,
      roomId: change?.roomId ?? schedule.roomId,
      onDate: date,
      startsAt: toInstant(date, change?.startTime ?? schedule.startTime),
      endsAt: toInstant(date, change?.endTime ?? schedule.endTime),
    });
  }
  return sessions;
}

// คาบที่ต่อกันพอดีขอบ (จบ 12:00 อีกคาบเริ่ม 12:00) ไม่นับว่าชน
export function overlaps(
  a: { startsAt: Date; endsAt: Date },
  b: { startsAt: Date; endsAt: Date },
): boolean {
  return a.startsAt < b.endsAt && b.startsAt < a.endsAt;
}
