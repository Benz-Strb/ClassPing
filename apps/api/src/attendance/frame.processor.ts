import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { CLOCK, type Clock } from '../common/clock.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { cosine } from '../enrollment/pose-check.js';
import type { DetectedFace, DetectResult } from '../face/face.client.js';
import {
  ATTENDANCE_REPO,
  type AttendanceRepo,
  type CameraRecord,
  type SessionContext,
} from './attendance.repo.js';
import {
  classify,
  livenessOf,
  nextWrite,
  statusAt,
  type Liveness,
  type Verdict,
} from './decide.js';
import type { FrameJob } from './frame-queue.js';
import { bestTwo, loadCourseGallery, type GalleryEntry } from './gallery.js';
import { LiveFaces, type LiveFace } from './live-faces.js';
import { LiveStreaks } from './live-streaks.js';
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
    private readonly liveFaces: LiveFaces,
    private readonly streaks: LiveStreaks,
  ) {}

  async process(job: FrameJob): Promise<FrameOutcome> {
    const outcome: FrameOutcome = { matched: 0, review: 0, unknown: 0 };
    this.forgetEndedSessions();

    const context = await this.cached(this.contexts, job.sessionId, () =>
      this.repo.sessionContext(job.sessionId),
    );
    if (!context) return outcome;

    const { faces, width, height } = await this.deps.detect(
      Buffer.from(job.image, 'base64'),
      'image/jpeg',
      { crops: true },
    );
    const seenAt = new Date(job.receivedAt);
    const live: LiveFace[] = [];
    if (!faces.length) {
      this.liveFaces.set(job.sessionId, seenAt, live);
      return outcome;
    }

    const gallery = await this.cached(this.galleries, context.courseId, () =>
      loadCourseGallery(this.repo, this.deps, context.courseId),
    );
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
      const liveness = livenessOf(face.liveness, this.config.livenessMin);
      if (this.config.matchLog) {
        const size = Math.round(Math.min(face.bbox[2] - face.bbox[0], face.bbox[3] - face.bbox[1]));
        this.logger.log(
          `${best.bestId ?? '-'} ${best.score?.toFixed(3) ?? '-'} | ` +
            `${best.secondId ?? '-'} ${best.secondScore?.toFixed(3) ?? '-'} | ${size}px | ${verdict.kind} | ` +
            (face.liveness == null ? '-' : `${liveness} ${face.liveness.toFixed(3)}`),
        );
      }

      const [x1, y1, x2, y2] = face.bbox;
      live.push({
        box: [x1 / width, y1 / height, x2 / width, y2 / height],
        userId: verdict.kind === 'unknown' ? null : verdict.userId,
        kind: verdict.kind !== 'unknown' && liveness === 'spoof' ? 'review' : verdict.kind,
      });

      if (verdict.kind === 'unknown') {
        await this.saveUnknown(job.sessionId, context.endsAt, face, seenAt);
        outcome.unknown++;
      } else {
        await this.record(job.sessionId, context, verdict, face, seenAt, liveness);
        outcome[verdict.kind === 'match' ? 'matched' : 'review']++;
      }
    }
    this.liveFaces.set(job.sessionId, seenAt, live);
    return outcome;
  }

  private async record(
    sessionId: string,
    context: SessionContext,
    verdict: Exclude<Verdict, { kind: 'unknown' }>,
    face: DetectedFace,
    seenAt: Date,
    liveness: Liveness,
  ) {
    // ภาพ match นับทุกภาพ ส่วนภาพ review นับเฉพาะที่เป็น spoof เพื่อตัดรอบ
    const streak =
      verdict.kind === 'match' || liveness === 'spoof'
        ? this.streaks.see(sessionId, verdict.userId, liveness, seenAt, context.endsAt)
        : { count: 0, since: null };
    const spoof = liveness === 'spoof';
    const current = await this.repo.find(sessionId, verdict.userId);
    const clearsSpoof =
      verdict.kind === 'match' && !spoof && streak.count >= this.config.livenessStreak;
    // แทนแถว spoof ด้วยคนจริง ให้นับเวลาจากภาพแรกของรอบ
    const countedAt =
      clearsSpoof && current?.reviewReason === 'spoof' ? (streak.since ?? seenAt) : seenAt;
    const status =
      verdict.kind === 'match' && !spoof
        ? statusAt(countedAt, context.startsAt, context.endsAt, context.rules)
        : 'pending';
    const action = nextWrite(
      current && {
        status: current.status,
        byTeacher: current.updatedBy !== null,
        reviewReason: current.reviewReason,
      },
      { status, clearsSpoof },
    );
    if (action === 'skip') return;

    const imagePath = await this.upload(`${sessionId}/${verdict.userId}`, face.crop);
    const record: CameraRecord = {
      sessionId,
      userId: verdict.userId,
      status,
      firstSeenAt: countedAt,
      confidence: verdict.score,
      imagePath,
      reviewReason: spoof ? 'spoof' : null,
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
    this.streaks.forgetEnded(now);
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
