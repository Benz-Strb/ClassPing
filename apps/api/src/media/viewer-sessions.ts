import { Injectable } from '@nestjs/common';

// สายคนดูสดแต่ละสายต่อมาจากคาบไหน (รหัสสายที่ MediaMTX ส่งมาตอนถามสิทธิ์ = id ใน sessions/list)
// watchdog ใช้ตัดคนดูที่คาบไม่ตรงกับคาบปัจจุบันของห้อง
// เก็บในหน่วยความจำ API เริ่มใหม่แล้วสายเดิมไม่มีข้อมูล จะถูกตัดแล้วเว็บต่อใหม่เอง
@Injectable()
export class ViewerSessions {
  private readonly bound = new Map<string, { sessionId: string; seq: number }>();
  private seq = 0;

  bind(connId: string, sessionId: string) {
    this.bound.set(connId, { sessionId, seq: ++this.seq });
  }

  sessionOf(connId: string): string | undefined {
    return this.bound.get(connId)?.sessionId;
  }

  // เรียกก่อนดึงรายการสาย สายที่ผูกหลังจากนี้อาจยังไม่อยู่ในรายการ
  mark(): number {
    return this.seq;
  }

  prune(alive: Set<string>, mark: number) {
    for (const [connId, { seq }] of this.bound) {
      if (seq <= mark && !alive.has(connId)) this.bound.delete(connId);
    }
  }
}
