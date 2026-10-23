import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { CLOCK, type Clock } from '../common/clock.js';
import { CLEANUP_REPO, type Bucket, type CleanupRepo } from './cleanup.repo.js';

const HOUR_MS = 60 * 60 * 1000;
// ไฟล์ที่เพิ่งอัปโหลดอาจยังไม่มีแถวชี้ถึง (อัปโหลดก่อนแล้วค่อยบันทึก) อย่าเพิ่งลบ
const GRACE_MS = HOUR_MS;
const BUCKETS: Bucket[] = ['captures', 'faces'];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ลบรูปที่ไม่มีแถวไหนชี้ถึงแล้ว เช่น ลบวิชา คาบ หรือผู้ใช้ไป แถวหายตาม cascade แต่ไฟล์ยังอยู่
export async function sweepBucket(
  repo: CleanupRepo,
  bucket: Bucket,
  now: Date,
): Promise<number> {
  // โฟลเดอร์ที่ชื่อไม่ใช่ id ไม่ใช่ของระบบนี้ ไม่แตะ
  const folders = (await repo.folders(bucket)).filter((f) => UUID.test(f));
  if (!folders.length) return 0;
  const owners = await repo.existingOwners(bucket, folders);
  const cutoff = now.getTime() - GRACE_MS;

  let removed = 0;
  for (const folder of folders) {
    const old = (await repo.files(bucket, folder)).filter((f) => f.createdAt.getTime() <= cutoff);
    if (!old.length) continue;
    const refs = owners.has(folder) ? await repo.referenced(bucket, folder) : new Set<string>();
    const orphans = old.filter((f) => !refs.has(f.path)).map((f) => f.path);
    if (!orphans.length) continue;
    await repo.remove(bucket, orphans);
    removed += orphans.length;
  }
  return removed;
}

// start() เรียกจาก main.ts ที่เดียว
@Injectable()
export class OrphanFilesRunner implements OnModuleDestroy {
  private readonly logger = new Logger(OrphanFilesRunner.name);
  private timer?: NodeJS.Timeout;

  constructor(
    @Inject(CLEANUP_REPO) private readonly repo: CleanupRepo,
    @Inject(CLOCK) private readonly now: Clock,
  ) {}

  start() {
    void this.run();
    this.timer = setInterval(() => void this.run(), 24 * HOUR_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  async run() {
    for (const bucket of BUCKETS) {
      try {
        const removed = await sweepBucket(this.repo, bucket, this.now());
        if (removed) this.logger.log(`ลบรูปที่ไม่มีเจ้าของใน ${bucket} ${removed} ไฟล์`);
      } catch (error) {
        this.logger.warn(`ลบรูปที่ไม่มีเจ้าของใน ${bucket} ไม่สำเร็จ: ${String(error)}`);
      }
    }
  }
}
