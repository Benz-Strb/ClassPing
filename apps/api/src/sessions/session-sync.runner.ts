import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { SessionsService } from './sessions.service.js';

const HOUR_MS = 60 * 60 * 1000;

// สร้างคาบล่วงหน้าตอนเปิด API และทุกชั่วโมง (วันใหม่จะมีคาบของวันที่ 7 เพิ่มเข้ามา)
// เรียก start() จาก main.ts เท่านั้น เทสต์ที่บูต AppModule จึงไม่วิ่ง
@Injectable()
export class SessionSyncRunner implements OnModuleDestroy {
  private readonly logger = new Logger(SessionSyncRunner.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly sessions: SessionsService) {}

  start() {
    void this.run();
    this.timer = setInterval(() => void this.run(), HOUR_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  private async run() {
    try {
      await this.sessions.syncAll();
    } catch (error) {
      // ฐานข้อมูลล่มชั่วคราวไม่ควรทำให้ API ล่ม รอบหน้าค่อยลองใหม่
      this.logger.warn(`สร้างคาบล่วงหน้าไม่สำเร็จ: ${String(error)}`);
    }
  }
}
