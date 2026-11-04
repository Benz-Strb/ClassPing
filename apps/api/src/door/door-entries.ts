import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../common/clock.js';

// เวลาที่กล้องประตูเห็นคนเดินเข้าห้อง ไว้เสนอเป็นเวลากลับให้อาจารย์
// เก็บในหน่วยความจำ หายตอน restart ได้ และลืมคาบที่จบแล้ว
@Injectable()
export class DoorEntries {
  private readonly sessions = new Map<string, { endsAt: Date; times: Date[] }>();

  constructor(@Inject(CLOCK) private readonly now: Clock) {}

  add(sessionId: string, at: Date, endsAt: Date): void {
    this.forgetEnded();
    const entry = this.sessions.get(sessionId) ?? { endsAt, times: [] };
    entry.times.push(at);
    this.sessions.set(sessionId, entry);
  }

  // เวลาเข้าที่อยู่ในช่วง from ถึง to (รวมปลายทั้งสอง) เรียงจากเก่าไปใหม่
  between(sessionId: string, from: Date, to: Date): Date[] {
    this.forgetEnded();
    return (this.sessions.get(sessionId)?.times ?? [])
      .filter((t) => t >= from && t <= to)
      .sort((a, b) => a.getTime() - b.getTime());
  }

  private forgetEnded() {
    const now = this.now();
    for (const [sessionId, entry] of this.sessions) {
      if (entry.endsAt <= now) this.sessions.delete(sessionId);
    }
  }
}
