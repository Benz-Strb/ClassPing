import { Injectable } from '@nestjs/common';

// กรอบหน้าในเฟรมล่าสุด เป็นสัดส่วนของภาพ (0-1) [ซ้าย, บน, ขวา, ล่าง]
export interface LiveFace {
  box: [number, number, number, number];
  userId: string | null;
  kind: 'match' | 'review' | 'unknown';
}

// mirrored = วิดีโอสดของคาบนี้ถูกกลับซ้ายขวา (เว็บแคม) กรอบเป็นพิกัดภาพที่ไม่กลับเสมอ
export interface LiveEntry {
  at: Date;
  faces: LiveFace[];
  mirrored: boolean;
}

// กล้องส่งภาพวินาทีละครั้ง ไม่มีผลใหม่นานกว่านี้ถือว่ากล้องหยุดแล้ว
const STALE_MS = 5000;

// ผลตรวจหน้าล่าสุดของแต่ละคาบ ไว้วาดกรอบบนหน้ากล้องสด
// เก็บในหน่วยความจำอย่างเดียว ไม่มีรูป ไม่ลงฐานข้อมูล
@Injectable()
export class LiveFaces {
  private readonly latest = new Map<string, LiveEntry>();

  set(sessionId: string, at: Date, faces: LiveFace[], mirrored: boolean) {
    this.latest.set(sessionId, { at, faces, mirrored });
  }

  get(sessionId: string, now: Date): LiveEntry | null {
    const entry = this.latest.get(sessionId);
    if (!entry) return null;
    if (now.getTime() - entry.at.getTime() > STALE_MS || now < entry.at) {
      if (now.getTime() - entry.at.getTime() > STALE_MS) this.latest.delete(sessionId);
      return null;
    }
    return entry;
  }
}
