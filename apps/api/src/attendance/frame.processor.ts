import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { CLOCK, type Clock } from '../common/clock.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { cosine, isComplete } from '../enrollment/pose-check.js';
import type { DetectedFace, DetectResult } from '../face/face.client.js';
import {
  ATTENDANCE_REPO,
  type AttendanceRepo,
  type CameraRecord,
  type SessionContext,
} from './attendance.repo.js';
import { classify, nextWrite, statusAt, type Verdict } from './decide.js';
import type { FrameJob } from './frame-queue.js';
import { bestTwo, type GalleryEntry } from './gallery.js';
import { RejectedGuesses } from './rejected-guesses.js';

// ของที่ต้องใช้จาก module อื่น แยกออกมาให้เทสต์ใส่ของปลอมได้ง่าย
export interface FrameDeps {
  detect(image: Buffer, mime: string, opts: { crops: boolean }): Promise<DetectResult>;
  model(): Promise<string>;
  enrolledUserIds(courseId: string): Promise<string[]>;
}

export const FRAME_DEPS = Symbol('FRAME_DEPS');

export interface FrameOutcome {
  matched: number;
  review: number;
  unknown: number;
}

// ลงทะเบียนหรือรีเซ็ตหน้ากลางคาบ มีผลภายในเวลานี้
const CACHE_MS = 60_000;

interface Cached<T> {
  value: T;
  loadedAt: number;
}

@Injectable()
export class FrameProcessor {
  private readonly logger = new Logger(FrameProcessor.name);
  private readonly contexts = new Map<string, Cached<SessionContext | null>>();
  private readonly galleries = new Map<string, Cached<GalleryEntry[]>>();
  // หน้าที่ไม่รู้จักที่เก็บไปแล้วในแต่ละคาบ กันเก็บคนเดิมซ้ำทุกเฟรม
  private readonly unknowns = new Map<string, { endsAt: Date; embeddings: number[][] }>();

  constructor(
    @Inject(ATTENDANCE_REPO) private readonly repo: AttendanceRepo,
    @Inject(FRAME_DEPS) private readonly deps: FrameDeps,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CLOCK) private readonly now: Clock,
    private readonly rejected: RejectedGuesses,
  ) {}

  async process(job: FrameJob): Promise<FrameOutcome> {
    const outcome: FrameOutcome = { matched: 0, review: 0, unknown: 0 };
    this.forgetEndedSessions();

    const context = await this.cached(this.contexts, job.sessionId, () =>
      this.repo.sessionContext(job.sessionId),
    );
    if (!context) return outcome;

    const { faces } = await this.deps.detect(Buffer.from(job.image, 'base64'), 'image/jpeg', {
      crops: true,
    });
    if (!faces.length) return outcome;

    const gallery = await this.cached(this.galleries, context.courseId, () =>
      this.loadGallery(context.courseId),
    );
    const seenAt = new Date(job.receivedAt);
    const thresholds = {
      acceptMin: this.config.matchAcceptMin,
      reviewMin: this.config.matchReviewMin,
    };

    for (const face of faces) {
      const best = bestTwo(face.embedding, gallery);
      let verdict = classify(best, thresholds);
      if (verdict.kind === 'review' && this.rejected.isRejected(job.sessionId, verdict.userId)) {
        verdict = { kind: 'unknown' };
      }
      if (this.config.matchLog) {
        const size = Math.round(Math.min(face.bbox[2] - face.bbox[0], face.bbox[3] - face.bbox[1]));
        this.logger.log(
          `${best.bestId ?? '-'} ${best.score?.toFixed(3) ?? '-'} | ` +
            `${best.secondId ?? '-'} ${best.secondScore?.toFixed(3) ?? '-'} | ${size}px | ${verdict.kind}`,
        );
      }

      if (verdict.kind === 'unknown') {
        await this.saveUnknown(job.sessionId, context.endsAt, face, seenAt);
        outcome.unknown++;
      } else {
        await this.record(job.sessionId, context, verdict, face, seenAt);
        outcome[verdict.kind === 'match' ? 'matched' : 'review']++;
      }
    }
    return outcome;
  }

  private async record(
    sessionId: string,
    context: SessionContext,
    verdict: Exclude<Verdict, { kind: 'unknown' }>,
    face: DetectedFace,
    seenAt: Date,
  ) {
    const status =
      verdict.kind === 'match'
        ? statusAt(seenAt, context.startsAt, context.endsAt, context.rules)
        : 'pending';
    const current = await this.repo.find(sessionId, verdict.userId);
    const action = nextWrite(
      current && { status: current.status, byTeacher: current.updatedBy !== null },
      { status },
    );
    if (action === 'skip') return;

    const imagePath = await this.upload(`${sessionId}/${verdict.userId}`, face.crop);
    const record: CameraRecord = {
      sessionId,
      userId: verdict.userId,
      status,
      firstSeenAt: seenAt,
      confidence: verdict.score,
      imagePath,
    };
    let written: boolean;
    try {
      written =
        action === 'insert'
          ? await this.repo.insertIfAbsent(record)
          : await this.repo.replacePending(record);
    } catch (error) {
      await this.removeQuietly(imagePath);
      throw error;
    }
    // ระหว่างอัปโหลด อาจารย์แก้แถวนี้ไปแล้ว ผลของอาจารย์ชนะ
    if (!written) {
      await this.removeQuietly(imagePath);
      return;
    }
    if (action === 'replace') await this.removeQuietly(current?.imagePath ?? null);
  }

  private async saveUnknown(sessionId: string, endsAt: Date, face: DetectedFace, seenAt: Date) {
    const seen = this.unknowns.get(sessionId) ?? { endsAt, embeddings: [] };
    this.unknowns.set(sessionId, seen);
    if (seen.embeddings.some((e) => cosine(e, face.embedding) >= this.config.matchAcceptMin)) {
      return;
    }

    const imagePath = await this.upload(`${sessionId}/unknown`, face.crop);
    if (imagePath) {
      try {
        await this.repo.insertUnknown(sessionId, imagePath, seenAt);
      } catch (error) {
        await this.removeQuietly(imagePath);
        throw error;
      }
    }
    seen.embeddings.push(face.embedding);
  }

  private async upload(prefix: string, crop: string | null | undefined): Promise<string | null> {
    if (!crop) return null;
    const path = `${prefix}-${randomUUID()}.jpg`;
    await this.repo.uploadCapture(path, Buffer.from(crop, 'base64'));
    return path;
  }

  private async removeQuietly(path: string | null) {
    if (!path) return;
    await this.repo.removeCaptures([path]).catch((error: unknown) => {
      this.logger.warn(`ลบรูป ${path} ไม่สำเร็จ: ${String(error)}`);
    });
  }

  // เทียบเฉพาะคนในวิชาที่ลงทะเบียนครบทุกท่า ด้วยโมเดลเดียวกับที่ service ใช้อยู่
  private async loadGallery(courseId: string): Promise<GalleryEntry[]> {
    const userIds = await this.deps.enrolledUserIds(courseId);
    if (!userIds.length) return [];
    const rows = await this.repo.faceEmbeddings(userIds, await this.deps.model());

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
    const hit = cache.get(key);
    if (hit && now - hit.loadedAt < CACHE_MS) return hit.value;
    const value = await load();
    cache.set(key, { value, loadedAt: now });
    return value;
  }

  private forgetEndedSessions() {
    const now = this.now();
    for (const [sessionId, seen] of this.unknowns) {
      if (seen.endsAt <= now) this.unknowns.delete(sessionId);
    }
    for (const cache of [this.contexts, this.galleries]) {
      for (const [key, hit] of cache) {
        if (now.getTime() - hit.loadedAt >= CACHE_MS) cache.delete(key);
      }
    }
  }
}
