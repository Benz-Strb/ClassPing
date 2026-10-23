import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { CLOCK, type Clock } from '../common/clock.js';
import { ATTENDANCE_REPO, type AttendanceRepo } from './attendance.repo.js';

const HOUR_MS = 60 * 60 * 1000;
// คนนอกวิชาไม่ได้ให้ความยินยอม เก็บรูปไว้แค่ช่วงสั้น ๆ
const KEEP_DAYS = 7;

// start() เรียกจาก main.ts ที่เดียว
@Injectable()
export class UnknownCleanupRunner implements OnModuleDestroy {
  private readonly logger = new Logger(UnknownCleanupRunner.name);
  private timer?: NodeJS.Timeout;

  constructor(
    @Inject(ATTENDANCE_REPO) private readonly repo: AttendanceRepo,
    @Inject(CLOCK) private readonly now: Clock,
  ) {}

  start() {
    void this.run();
    this.timer = setInterval(() => void this.run(), HOUR_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  async run() {
    try {
      const before = new Date(this.now().getTime() - KEEP_DAYS * 24 * HOUR_MS);
      const paths = await this.repo.deleteUnknownBefore(before);
      if (paths.length) await this.repo.removeCaptures(paths);
    } catch (error) {
      this.logger.warn(`ลบรูปหน้าที่ไม่รู้จักไม่สำเร็จ: ${String(error)}`);
    }
  }
}
