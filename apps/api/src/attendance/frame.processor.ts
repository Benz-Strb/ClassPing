import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { CLOCK, type Clock } from '../common/clock.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { cosine } from '../enrollment/pose-check.js';
import { DOOR_REPO, type DoorRepo } from '../door/door.repo.js';
import { OpenTrips } from '../door/open-trips.js';
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
  type AttendanceStatus,
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
  // embedding ของหน้าใหญ่สุดในรูปครอป ไม่เจอหน้าคืน null
  verifyCrop(crop: Buffer): Promise<number[] | null>;
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
// ตรวจครอปจากบอร์ดไม่ผ่าน เว้นคนนั้นไว้ก่อนตรวจใหม่ (ไม่เรียก face service ทุกเฟรม)
// face service ไม่ตอบ เว้นนาน ส่วนตอบแล้วแต่ไม่ผ่าน (ไม่เจอหน้า/ไม่ตรง) เว้นสั้น ๆ จะได้ไม่มาสายเกินจริง
export const VERIFY_DOWN_BACKOFF_MS = 30_000;
export const VERIFY_FAIL_BACKOFF_MS = 5_000;

type Matching = { gallery: GalleryEntry[]; thresholds: { acceptMin: number; reviewMin: number } };
// problem = null คือผ่าน, waiting = ยังอยู่ในช่วงเว้น ไม่ได้ตรวจจริง
type Verification = { problem: string | null; waiting: boolean };

function once<T>(fn: () => Promise<T>): () => Promise<T> {
  let result: Promise<T> | undefined;
  return () => (result ??= fn());
}

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
  // คนที่ตรวจครอปไม่ผ่าน -> เวลาที่ตรวจใหม่ได้ แยกตามคาบ
  private readonly verifyWaits = new Map<string, { endsAt: Date; until: Map<string, number> }>();

  constructor(
    @Inject(ATTENDANCE_REPO) private readonly repo: AttendanceRepo,
    @Inject(FRAME_DEPS) private readonly deps: FrameDeps,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CLOCK) private readonly now: Clock,
    private readonly rejected: RejectedGuesses,
    private readonly liveFaces: LiveFaces,
    private readonly streaks: LiveStreaks,
    private readonly openTrips: OpenTrips,
    @Inject(DOOR_REPO) private readonly door: DoorRepo,
  ) {}

  async process(job: FrameJob): Promise<FrameOutcome> {
    const outcome: FrameOutcome = { matched: 0, review: 0, unknown: 0 };
    this.forgetEndedSessions();

    const context = await this.cached(this.contexts, job.sessionId, () =>
      this.repo.sessionContext(job.sessionId),
    );
    if (!context) return outcome;

    const board = 'result' in job;
    const { faces, width, height } = board
      ? job.result
      : await this.deps.detect(Buffer.from(job.image, 'base64'), 'image/jpeg', { crops: true });
    const seenAt = new Date(job.receivedAt);
    const live: LiveFace[] = [];
    if (!faces.length) {
      this.liveFaces.set(job.sessionId, seenAt, live);
      return outcome;
    }

    // ผลจากบอร์ดใช้โมเดลที่ตั้งไว้ใน config ไม่ต้องรอ face service
    const gallery = await this.cached(
      this.galleries,
      board ? `${context.courseId}|board` : context.courseId,
      () =>
        loadCourseGallery(
          this.repo,
          board ? { ...this.deps, model: async () => this.config.boardFaceModel } : this.deps,
          context.courseId,
        ),
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
        // ผลจากบอร์ดตรวจครอปซ้ำครั้งเดียวต่อหน้า ใช้ทั้งปิดรอบนอกห้องและเขียนมา/สาย
        const verify = board
          ? once(() =>
              this.verifyBoard(job.sessionId, context.endsAt, face, verdict.userId, seenAt, {
                gallery,
                thresholds,
              }),
            )
          : null;
        if (verdict.kind === 'match' && liveness !== 'spoof') {
          await this.closeTripIfOut(job.sessionId, verdict.userId, seenAt, verify);
        }
        await this.record(job.sessionId, context, verdict, face, seenAt, liveness, verify);
        outcome[verdict.kind === 'match' ? 'matched' : 'review']++;
      }
    }
    this.liveFaces.set(job.sessionId, seenAt, live);
    return outcome;
  }

  // เห็นคนที่ออกนอกห้องอยู่ด้วยความมั่นใจ ปิดรอบ ถ้า repo ไม่ปิดให้ก็ปล่อยไว้
  // ผลจากบอร์ดต้องตรวจครอปผ่านก่อน พังตรงนี้ไม่กระทบการเช็คชื่อ
  private async closeTripIfOut(
    sessionId: string,
    userId: string,
    seenAt: Date,
    verify: (() => Promise<Verification>) | null,
  ) {
    try {
      if (!(await this.openTrips.has(sessionId, userId))) return;
      if (verify && (await verify()).problem !== null) return;
      if (await this.door.closeTrip(sessionId, userId, seenAt, 'front')) {
        await this.openTrips.remove(sessionId, userId);
      }
    } catch (error) {
      this.logger.warn(`ปิดรอบนอกห้องของ ${userId} ไม่สำเร็จ: ${String(error)}`);
    }
  }

  private async record(
    sessionId: string,
    context: SessionContext,
    verdict: Exclude<Verdict, { kind: 'unknown' }>,
    face: DetectedFace,
    seenAt: Date,
    liveness: Liveness,
    verify: (() => Promise<Verification>) | null,
  ) {
    // ภาพ match นับทุกภาพ ส่วนภาพ review นับเฉพาะที่เป็น spoof เพื่อตัดรอบ
    const streak =
      verdict.kind === 'match' || liveness === 'spoof'
        ? this.streaks.see(sessionId, verdict.userId, liveness, seenAt, context.endsAt)
        : { count: 0, since: null };
    const spoof = liveness === 'spoof';
    const current = await this.repo.find(sessionId, verdict.userId);
    let clearsSpoof =
      verdict.kind === 'match' && !spoof && streak.count >= this.config.livenessStreak;
    // แทนแถว spoof ด้วยคนจริง ให้นับเวลาจากภาพแรกของรอบ
    const countedAt =
      clearsSpoof && current?.reviewReason === 'spoof' ? (streak.since ?? seenAt) : seenAt;
    let status: AttendanceStatus =
      verdict.kind === 'match' && !spoof
        ? statusAt(countedAt, context.startsAt, context.endsAt, context.rules)
        : 'pending';
    const existing = current && {
      status: current.status,
      byTeacher: current.updatedBy !== null,
      reviewReason: current.reviewReason,
    };
    let action = nextWrite(existing, { status, clearsSpoof });
    if (action === 'skip') return;

    // ผลจากบอร์ดจะเขียนว่ามา/สาย ต้องให้ API ตรวจหน้าจากครอปซ้ำก่อน
    // ไม่ผ่านก็ลงเป็นรอตรวจ (ไม่ใช่ spoof จึงไม่ปลดแถว spoof) รอบหน้ายังอัปเกรดได้
    if (verify && status !== 'pending') {
      const { problem, waiting } = await verify();
      if (problem) {
        // ช่วงเว้นไม่ได้ตรวจจริง ไม่ต้อง warn ซ้ำทุกเฟรม
        if (!waiting) this.logger.warn(`${verdict.userId} ${problem} เขียนเป็นรอตรวจแทน`);
        status = 'pending';
        clearsSpoof = false;
        action = nextWrite(existing, { status, clearsSpoof });
        if (action === 'skip') return;
      }
    }

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

  // ตรวจไม่ผ่านแล้วเว้นคนนั้นตามสาเหตุ ระหว่างนั้นถือว่าไม่ผ่าน (เขียนเป็นรอตรวจตามเดิม)
  private async verifyBoard(
    sessionId: string,
    endsAt: Date,
    face: DetectedFace,
    userId: string,
    seenAt: Date,
    matching: Matching,
  ): Promise<Verification> {
    const waits = this.verifyWaits.get(sessionId);
    const until = waits?.until.get(userId);
    if (until !== undefined && seenAt.getTime() < until) {
      return { problem: 'ตรวจครอปไม่ผ่านเมื่อไม่นานนี้', waiting: true };
    }
    const { problem, down } = await this.verifyProblem(face, userId, matching);
    if (problem === null) {
      waits?.until.delete(userId);
    } else if (face.crop) {
      // ไม่มีครอปไม่ได้เรียก face service ไม่ต้องเว้น
      const entry = waits ?? { endsAt, until: new Map<string, number>() };
      const wait = down ? VERIFY_DOWN_BACKOFF_MS : VERIFY_FAIL_BACKOFF_MS;
      entry.until.set(userId, seenAt.getTime() + wait);
      this.verifyWaits.set(sessionId, entry);
    }
    return { problem, waiting: false };
  }

  // คืนเหตุผลที่ตรวจไม่ผ่าน (null ถ้าผ่าน) และ down = face service ไม่ตอบ ไม่โยน error ออกไป
  private async verifyProblem(
    face: DetectedFace,
    userId: string,
    matching: Matching,
  ): Promise<{ problem: string | null; down: boolean }> {
    if (!face.crop) return { problem: 'ไม่มีรูปครอปให้ตรวจ', down: false };
    let again: number[] | null;
    try {
      again = await this.deps.verifyCrop(Buffer.from(face.crop, 'base64'));
    } catch (error) {
      return { problem: `ตรวจหน้าซ้ำไม่สำเร็จ (${String(error)})`, down: true };
    }
    const fail = (problem: string) => ({ problem, down: false });
    if (!again) return fail('ตรวจหน้าซ้ำจากครอปไม่เจอหน้า');
    if (cosine(again, face.embedding) < this.config.boardVerifyMin) {
      return fail('ตรวจหน้าซ้ำแล้วไม่ตรงกับที่บอร์ดส่งมา');
    }
    // embedding ที่เซิร์ฟเวอร์คิดเอง ต้องเป็นคนเดียวกับที่กำลังจะบันทึกด้วย
    const serverMatch = classify(bestTwo(again, matching.gallery), matching.thresholds);
    if (serverMatch.kind !== 'match' || serverMatch.userId !== userId) {
      return fail('ตรวจหน้าซ้ำจากครอปแล้วไม่ใช่คนเดียวกับที่บอร์ดบอก');
    }
    return { problem: null, down: false };
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
    for (const map of [this.unknowns, this.verifyWaits]) {
      for (const [sessionId, entry] of map) {
        if (entry.endsAt <= now) map.delete(sessionId);
      }
    }
    for (const cache of [this.contexts, this.galleries]) {
      for (const [key, hit] of cache) {
        if (now.getTime() - hit.loadedAt >= CACHE_MS) cache.delete(key);
      }
    }
  }
}
