export interface TripTimes {
  outAt: Date;
  backAt: Date | null;
}

export type OutLabel = 'out' | 'gone' | 'gone_no_return';

export interface OutOfRoom {
  totalSeconds: number;
  minutes: number;
  label: OutLabel | null;
}

// รอบที่กลับก่อนหรือพอดีเวลาเริ่มคาบอยู่นอกคาบ ไม่นับและไม่แสดง
export function inSession<T extends TripTimes>(trips: T[], startsAt: Date): T[] {
  return trips.filter((t) => !t.backAt || t.backAt.getTime() > startsAt.getTime());
}

// นับเฉพาะส่วนที่อยู่ในคาบ: จากที่หลังกว่าของเวลาออกกับเวลาเริ่มคาบ
// รอบที่ยังไม่กลับนับถึงหมดคาบ ไม่นับถึงตอนนี้ เพื่อให้ผลไม่เปลี่ยนตามเวลาที่เปิดดู
export function tripSeconds(trip: TripTimes, startsAt: Date, endsAt: Date): number {
  const from = Math.max(trip.outAt.getTime(), startsAt.getTime());
  const end = (trip.backAt ?? endsAt).getTime();
  return Math.max(0, Math.floor((end - from) / 1000));
}

// รวมวินาทีทุกรอบก่อน แล้วค่อยปัดเป็นนาทีเต็ม เกินเกณฑ์เมื่อนาทีมากกว่าเกณฑ์
export function outOfRoom(
  all: TripTimes[],
  startsAt: Date,
  endsAt: Date,
  limitMin: number,
): OutOfRoom {
  const trips = inSession(all, startsAt);
  if (trips.length === 0) return { totalSeconds: 0, minutes: 0, label: null };
  const totalSeconds = trips.reduce((sum, t) => sum + tripSeconds(t, startsAt, endsAt), 0);
  const minutes = Math.floor(totalSeconds / 60);
  const noReturn = trips.some((t) => t.backAt === null);
  const label: OutLabel = noReturn ? 'gone_no_return' : minutes > limitMin ? 'gone' : 'out';
  return { totalSeconds, minutes, label };
}
