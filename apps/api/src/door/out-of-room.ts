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

// รอบที่ยังไม่กลับนับถึงหมดคาบ ไม่นับถึงตอนนี้ เพื่อให้ผลไม่เปลี่ยนตามเวลาที่เปิดดู
export function tripSeconds(trip: TripTimes, endsAt: Date): number {
  const end = trip.backAt ?? endsAt;
  return Math.max(0, Math.floor((end.getTime() - trip.outAt.getTime()) / 1000));
}

// รวมวินาทีทุกรอบก่อน แล้วค่อยปัดเป็นนาทีเต็ม เกินเกณฑ์เมื่อนาทีมากกว่าเกณฑ์
export function outOfRoom(trips: TripTimes[], endsAt: Date, limitMin: number): OutOfRoom {
  if (trips.length === 0) return { totalSeconds: 0, minutes: 0, label: null };
  const totalSeconds = trips.reduce((sum, t) => sum + tripSeconds(t, endsAt), 0);
  const minutes = Math.floor(totalSeconds / 60);
  const noReturn = trips.some((t) => t.backAt === null);
  const label: OutLabel = noReturn ? 'gone_no_return' : minutes > limitMin ? 'gone' : 'out';
  return { totalSeconds, minutes, label };
}
