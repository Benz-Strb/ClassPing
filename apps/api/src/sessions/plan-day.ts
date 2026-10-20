// ไทยไม่มี daylight saving ใช้ +07:00 ตายตัวได้ ไม่พึ่ง timezone ของเครื่อง

export const TZ_OFFSET = '+07:00';
const OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ScheduleLike {
  id: string;
  courseId: string;
  // 0 = อาทิตย์
  weekday: number;
  startTime: string;
  endTime: string;
  roomId: string;
}

// null = ใช้ค่าเดิม
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

export function bangkokDate(now: Date): string {
  return new Date(now.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

export function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value;
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

export function bangkokTime(instant: Date): string {
  return new Date(instant.getTime() + OFFSET_MS).toISOString().slice(11, 16);
}

export function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

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

export function overlaps(
  a: { startsAt: Date; endsAt: Date },
  b: { startsAt: Date; endsAt: Date },
): boolean {
  return a.startsAt < b.endsAt && b.startsAt < a.endsAt;
}
