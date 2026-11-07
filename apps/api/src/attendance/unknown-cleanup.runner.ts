import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { CLOCK, type Clock } from '../common/clock.js';
import { DOOR_REPO, type DoorRepo } from '../door/door.repo.js';
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
    @Inject(DOOR_REPO) private readonly doorRepo: DoorRepo,
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
    const before = new Date(this.now().getTime() - KEEP_DAYS * 24 * HOUR_MS);
    await this.attempt('หน้าที่ไม่รู้จัก', () => this.cleanFaces(before));
    await this.attempt('รอบออกนอกห้องที่ไม่รู้ว่าใคร', () => this.cleanTrips(before));
  }

  // ลบไฟล์ก่อน ถ้าพังแถวยังอยู่ให้รอบถัดไปลองใหม่ รูปจะไม่ค้างแบบไม่มีใครรู้
  private async cleanFaces(before: Date) {
    const expired = await this.repo.unknownBefore(before);
    if (!expired.length) return;
    await this.repo.removeCaptures(expired.map((e) => e.imagePath));
    await this.repo.deleteUnknown(expired.map((e) => e.id));
  }

  private async cleanTrips(before: Date) {
    const expired = await this.doorRepo.unknownTripsBefore(before);
    if (!expired.length) return;
    const paths = expired.flatMap((e) => (e.imagePath ? [e.imagePath] : []));
    if (paths.length) await this.repo.removeCaptures(paths);
    await this.doorRepo.deleteTrips(expired.map((e) => e.id));
  }

  private async attempt(what: string, job: () => Promise<void>) {
    try {
      await job();
    } catch (error) {
      this.logger.warn(`ลบรูป${what}ไม่สำเร็จ: ${String(error)}`);
    }
  }
}
