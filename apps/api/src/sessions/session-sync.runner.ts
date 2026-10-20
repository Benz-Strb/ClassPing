import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { SessionsService } from './sessions.service.js';

const HOUR_MS = 60 * 60 * 1000;

// start() เรียกจาก main.ts ที่เดียว
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
      this.logger.warn(`สร้างคาบล่วงหน้าไม่สำเร็จ: ${String(error)}`);
    }
  }
}
