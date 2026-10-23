import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../common/clock.js';

// คนที่อาจารย์กด "ไม่ใช่นักศึกษาวิชานี้" แล้ว กล้องจะไม่เดาเป็นคนนั้นซ้ำแบบไม่แน่ใจจนหมดคาบ
// ไม่งั้นคนนอกที่ยังนั่งอยู่จะโผล่ในรายการรอตรวจทุกวินาที
@Injectable()
export class RejectedGuesses {
  private readonly items = new Map<string, Date>();

  constructor(@Inject(CLOCK) private readonly now: Clock) {}

  reject(sessionId: string, userId: string, sessionEndsAt: Date) {
    this.items.set(`${sessionId}|${userId}`, sessionEndsAt);
  }

  isRejected(sessionId: string, userId: string): boolean {
    const now = this.now();
    for (const [key, endsAt] of this.items) {
      if (endsAt <= now) this.items.delete(key);
    }
    return this.items.has(`${sessionId}|${userId}`);
  }
}
