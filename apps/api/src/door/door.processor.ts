import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ATTENDANCE_REPO,
  type AttendanceRepo,
  type SessionContext,
} from '../attendance/attendance.repo.js';
import { classify } from '../attendance/decide.js';
import type { FrameDeps } from '../attendance/frame.processor.js';
import {
  bestTwo,
  loadCourseGallery,
  type BestTwo,
  type GalleryEntry,
} from '../attendance/gallery.js';
import { CLOCK, type Clock } from '../common/clock.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { DOOR_REPO, type DoorRepo, type TripStatus } from './door.repo.js';
import { OpenTrips } from './open-trips.js';

export type TripResult = TripStatus | 'duplicate';

// เหมือน FrameDeps ของกล้องหน้าห้อง
export const DOOR_DEPS = Symbol('DOOR_DEPS');

// ลงทะเบียนหรือรีเซ็ตหน้ากลางคาบ มีผลภายในเวลานี้
const CACHE_MS = 60_000;

interface Cached<T> {
  value: T;
  loadedAt: number;
}

interface Candidate {
  best: BestTwo;
  crop: string | null;
}

@Injectable()
export class DoorProcessor {
  private readonly logger = new Logger(DoorProcessor.name);
  private readonly contexts = new Map<string, Cached<SessionContext | null>>();
  private readonly galleries = new Map<string, Cached<GalleryEntry[]>>();

  constructor(
    @Inject(ATTENDANCE_REPO) private readonly attendance: AttendanceRepo,
    @Inject(DOOR_REPO) private readonly repo: DoorRepo,
    @Inject(DOOR_DEPS) private readonly deps: FrameDeps,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CLOCK) private readonly now: Clock,
    private readonly openTrips: OpenTrips,
  ) {}

  // คนเดินออกผ่านประตูครั้งเดียว ถ้าบันทึกไม่สำเร็จรอบนั้นจะหายไป จึงต้องจดไว้เป็น unknown แม้ตรวจหน้าไม่ได้
  async handleOut(sessionId: string, images: Buffer[], outAt: Date): Promise<TripResult> {
    let candidate: Candidate | null = null;
    try {
      candidate = await this.bestFace(sessionId, images);
    } catch (error) {
      this.logger.warn(`ตรวจหน้าที่ประตูไม่สำเร็จ จดเป็น unknown: ${String(error)}`);
    }

    const verdict = candidate
      ? classify(candidate.best, {
          acceptMin: this.config.matchAcceptMin,
          reviewMin: this.config.matchReviewMin,
        })
      : ({ kind: 'unknown' } as const);

    if (verdict.kind === 'unknown') {
      const imagePath = await this.upload(`${sessionId}/door/unknown`, images[0]);
      await this.insert({
        sessionId,
        userId: null,
        status: 'unknown',
        outAt,
        confidence: candidate?.best.score ?? null,
        imagePath,
      });
      return 'unknown';
    }

    if (await this.openTrips.has(sessionId, verdict.userId)) {
      // รอบ pending เป็นแค่การเดา ผลที่มั่นใจมาทีหลังมาแทน ส่วนรอบ confirmed เดิมยังนับเป็น duplicate
      const replaced =
        verdict.kind === 'match' && (await this.repo.demotePendingTrip(sessionId, verdict.userId));
      if (!replaced) return 'duplicate';
      await this.openTrips.remove(sessionId, verdict.userId);
    }
    const status = verdict.kind === 'match' ? 'confirmed' : 'pending';
    const crop = candidate?.crop ? Buffer.from(candidate.crop, 'base64') : undefined;
    const imagePath = await this.upload(`${sessionId}/door/${verdict.userId}`, crop);
    const inserted = await this.insert({
      sessionId,
      userId: verdict.userId,
      status,
      outAt,
      confidence: verdict.score,
      imagePath,
    });
    // มีรอบเปิดอยู่แล้ว (คำขอซ้อนกัน หรือแคชเก่า) จดไว้กันถามฐานข้อมูลอีก
    await this.openTrips.add(sessionId, verdict.userId);
    return inserted ? status : 'duplicate';
  }

  // หน้าที่คะแนนเทียบสูงสุดจากทุกรูป ไม่มีหน้าเลย = null
  private async bestFace(sessionId: string, images: Buffer[]): Promise<Candidate | null> {
    if (!images.length) return null;
    const context = await this.cached(this.contexts, sessionId, () =>
      this.attendance.sessionContext(sessionId),
    );
    if (!context) return null;

    let found: Candidate | null = null;
    let gallery: GalleryEntry[] | null = null;
    let failures = 0;
    let lastError: unknown;
    for (const image of images) {
      let faces: Awaited<ReturnType<FrameDeps['detect']>>['faces'];
      try {
        ({ faces } = await this.deps.detect(image, 'image/jpeg', { crops: true }));
      } catch (error) {
        // รูปเดียวพังไม่ควรทิ้งผลจากรูปอื่น
        failures++;
        lastError = error;
        continue;
      }
      if (!faces.length) continue;
      gallery ??= await this.cached(this.galleries, context.courseId, () =>
        loadCourseGallery(this.attendance, this.deps, context.courseId),
      );
      for (const face of faces) {
        const best = bestTwo(face.embedding, gallery);
        if (!found || (best.score ?? -1) > (found.best.score ?? -1)) {
          found = { best, crop: face.crop ?? null };
        }
      }
    }
    // ทุกรูปตรวจไม่สำเร็จ ให้ผู้เรียกจดเป็น unknown เหมือนเดิม
    if (failures === images.length) throw lastError;
    return found;
  }

  // ลบรูปที่อัปโหลดไปถ้าเขียนแถวไม่สำเร็จหรือชน unique index
  private async insert(trip: Parameters<DoorRepo['insertTrip']>[0]): Promise<boolean> {
    let inserted: boolean;
    try {
      inserted = await this.repo.insertTrip(trip);
    } catch (error) {
      await this.removeQuietly(trip.imagePath);
      throw error;
    }
    if (!inserted) await this.removeQuietly(trip.imagePath);
    return inserted;
  }

  // อัปโหลดไม่สำเร็จก็ยังต้องจดรอบ (คนเดินผ่านประตูครั้งเดียว) จึงคืน null แทนการ throw
  private async upload(prefix: string, bytes: Buffer | undefined): Promise<string | null> {
    if (!bytes) return null;
    const path = `${prefix}-${randomUUID()}.jpg`;
    try {
      await this.attendance.uploadCapture(path, bytes);
    } catch (error) {
      this.logger.warn(`อัปโหลดรูปที่ประตูไม่สำเร็จ จดรอบโดยไม่มีรูป: ${String(error)}`);
      return null;
    }
    return path;
  }

  private async removeQuietly(path: string | null) {
    if (!path) return;
    await this.attendance.removeCaptures([path]).catch((error: unknown) => {
      this.logger.warn(`ลบรูป ${path} ไม่สำเร็จ: ${String(error)}`);
    });
  }

  private async cached<T>(
    cache: Map<string, Cached<T>>,
    key: string,
    load: () => Promise<T>,
  ): Promise<T> {
    const now = this.now().getTime();
    for (const [k, hit] of cache) {
      if (now - hit.loadedAt >= CACHE_MS) cache.delete(k);
    }
    const hit = cache.get(key);
    if (hit) return hit.value;
    const value = await load();
    cache.set(key, { value, loadedAt: now });
    return value;
  }
}
