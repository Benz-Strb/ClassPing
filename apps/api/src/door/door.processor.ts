import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ATTENDANCE_REPO,
  type AttendanceRepo,
  type SessionContext,
} from '../attendance/attendance.repo.js';
import { classify } from '../attendance/decide.js';
import type { FrameDeps } from '../attendance/frame.processor.js';
import { bestTwo, type BestTwo, type GalleryEntry } from '../attendance/gallery.js';
import { CLOCK, type Clock } from '../common/clock.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { isComplete } from '../enrollment/pose-check.js';
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

  // คนเดินออกครั้งเดียว กล้องไม่ส่งซ้ำ ถ้าตรวจหน้าไม่ได้ก็ยังต้องจดไว้เป็น unknown
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
      const imagePath = await this.upload(`${sessionId}/door-unknown`, images[0]);
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

    if (await this.openTrips.has(sessionId, verdict.userId)) return 'duplicate';
    const status = verdict.kind === 'match' ? 'confirmed' : 'pending';
    const crop = candidate?.crop ? Buffer.from(candidate.crop, 'base64') : undefined;
    const imagePath = await this.upload(`${sessionId}/door-${verdict.userId}`, crop);
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
    for (const image of images) {
      const { faces } = await this.deps.detect(image, 'image/jpeg', { crops: true });
      if (!faces.length) continue;
      gallery ??= await this.cached(this.galleries, context.courseId, () =>
        this.loadGallery(context.courseId),
      );
      for (const face of faces) {
        const best = bestTwo(face.embedding, gallery);
        if (!found || (best.score ?? -1) > (found.best.score ?? -1)) {
          found = { best, crop: face.crop ?? null };
        }
      }
    }
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

  private async upload(prefix: string, bytes: Buffer | undefined): Promise<string | null> {
    if (!bytes) return null;
    const path = `${prefix}-${randomUUID()}.jpg`;
    await this.attendance.uploadCapture(path, bytes);
    return path;
  }

  private async removeQuietly(path: string | null) {
    if (!path) return;
    await this.attendance.removeCaptures([path]).catch((error: unknown) => {
      this.logger.warn(`ลบรูป ${path} ไม่สำเร็จ: ${String(error)}`);
    });
  }

  // เทียบเฉพาะคนในวิชาที่ลงทะเบียนครบทุกท่า เหมือนกล้องหน้าห้อง
  private async loadGallery(courseId: string): Promise<GalleryEntry[]> {
    const userIds = await this.deps.enrolledUserIds(courseId);
    if (!userIds.length) return [];
    const rows = await this.attendance.faceEmbeddings(userIds, await this.deps.model());

    const byUser = new Map<string, { poses: string[]; embeddings: number[][] }>();
    for (const row of rows) {
      const entry = byUser.get(row.userId) ?? { poses: [], embeddings: [] };
      entry.poses.push(row.pose);
      entry.embeddings.push(row.embedding);
      byUser.set(row.userId, entry);
    }
    return [...byUser]
      .filter(([, entry]) => isComplete(entry.poses))
      .map(([userId, entry]) => ({ userId, embeddings: entry.embeddings }));
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
