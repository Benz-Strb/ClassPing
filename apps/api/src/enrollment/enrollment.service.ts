import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppError } from '../common/app-error.js';
import { CLOCK, type Clock } from '../common/clock.js';
import { dbError } from '../common/db-error.js';
import { looksLike } from '../common/image-type.js';
import { FaceClient, type EnrollResult } from '../face/face.client.js';
import { UsersService, type AppUser } from '../users/users.service.js';
import { CARD_MATCH_MIN, checkCard } from './card-check.js';
import { ENROLLMENT_REPO, type EnrollmentRepo, type FaceRow } from './enrollment.repo.js';
import {
  checkPose,
  cosine,
  isComplete,
  isPose,
  POSES,
  SAME_PERSON_MIN,
  type Pose,
} from './pose-check.js';

export interface UploadedImage {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

const EXTENSIONS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png' };

export interface FaceStatus {
  done: Pose[];
  // ยืนยันบัตรแล้วและครบทุกท่า
  complete: boolean;
  verified: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const alreadyEnrolled = () =>
  new AppError(409, 'ALREADY_ENROLLED', 'ลงทะเบียนใบหน้าไปแล้ว ถ้าต้องการลงใหม่ติดต่อผู้ดูแลระบบ');

const needIdentity = (message = 'ยืนยันตัวตนด้วยบัตรนักศึกษาก่อน') =>
  new AppError(409, 'IDENTITY_REQUIRED', message);

const notAStudent = () =>
  new AppError(403, 'NOT_A_STUDENT', 'ลงทะเบียนใบหน้าได้เฉพาะบัญชีนักศึกษา');

@Injectable()
export class EnrollmentService {
  private readonly logger = new Logger(EnrollmentService.name);

  constructor(
    @Inject(ENROLLMENT_REPO) private readonly repo: EnrollmentRepo,
    private readonly users: UsersService,
    private readonly face: FaceClient,
    @Inject(CLOCK) private readonly now: Clock,
  ) {}

  async consent(user: AppUser): Promise<AppUser> {
    if (!user.studentId) throw notAStudent();
    return this.users.setConsent(user.id);
  }

  async status(user: AppUser): Promise<FaceStatus> {
    if (!user.studentId) throw notAStudent();
    return toStatus(
      user,
      (await this.repo.listByUser(user.id)).map((r) => r.pose),
    );
  }

  // ภาพหน้าจอบัตรนักศึกษาออนไลน์ + รูปหน้าตรงสด ผ่านแล้วรูปหน้าตรงนี้เป็นท่า front
  // ท่าเก่าทั้งหมดถูกล้าง เพราะเคยเทียบกับหน้าตรงที่ยังไม่ได้ยืนยัน บัตรไม่ถูกเก็บที่ไหน
  async verifyIdentity(
    user: AppUser,
    card: UploadedImage | undefined,
    file: UploadedImage | undefined,
  ): Promise<FaceStatus> {
    this.checkAccount(user);
    if (!card || !file) throw new AppError(400, 'IMAGE_REQUIRED', 'ต้องแนบทั้งภาพบัตรและรูปหน้า');
    this.checkImage(card);
    this.checkImage(file);

    const rows = await this.repo.listByUser(user.id);
    if (user.identityVerifiedAt && isComplete(rows.map((r) => r.pose))) throw alreadyEnrolled();

    const read = await this.face.readCard(card.buffer, card.mimetype);
    const verdict = checkCard(read.lines, { studentCode: user.studentId!, today: this.now() });
    if (!verdict.ok) throw new AppError(422, verdict.code, verdict.message);
    const [cardFace, ...others] = read.faces;
    if (!cardFace) {
      throw new AppError(422, 'CARD_NO_FACE', 'ไม่เห็นรูปหน้าในบัตร ใช้ภาพหน้าจอบัตรทั้งใบ');
    }
    // บัตรจริงมีหน้าเดียว ภาพที่มีหน้าอื่นปนอาจเป็นภาพที่แต่งมา
    if (others.length) {
      throw new AppError(
        422,
        'CARD_MULTIPLE_FACES',
        'ภาพบัตรมีหลายหน้า ใช้ภาพหน้าจอบัตรของตัวเองใบเดียว',
      );
    }

    const result = await this.analyze(file, 'front');
    const score = cosine(cardFace.embedding, result.embedding);
    if (score < CARD_MATCH_MIN) {
      throw new AppError(
        422,
        'FACE_NOT_MATCH_CARD',
        'หน้าไม่ตรงกับรูปในบัตร ถ่ายหน้าตรงใหม่ในที่สว่าง',
      );
    }

    await this.removeQuietly(await this.repo.deleteByUser(user.id));
    await this.store(user.id, 'front', result, file, undefined);
    await this.users.setIdentity(user.id, score);
    return { done: ['front'], complete: false, verified: true };
  }

  // ถ่ายทีละท่า ท่าเดิมถ่ายซ้ำได้จนกว่าจะครบ รูปที่ไม่ผ่านไม่ถูกเก็บ
  // หน้าตรงมาทางยืนยันบัตรทางเดียว กันเปลี่ยนเป็นหน้าคนอื่นหลังยืนยันแล้ว
  async savePose(
    user: AppUser,
    poseName: string,
    file: UploadedImage | undefined,
  ): Promise<FaceStatus> {
    this.checkAccount(user);
    if (!isPose(poseName)) throw new AppError(404, 'NOT_FOUND', 'ไม่มีท่านี้');
    const pose = poseName;
    if (pose === 'front') throw needIdentity('หน้าตรงถ่ายตอนยืนยันตัวตนด้วยบัตร');
    if (!user.identityVerifiedAt) throw needIdentity();

    const rows = await this.repo.listByUser(user.id);
    if (isComplete(rows.map((r) => r.pose))) throw alreadyEnrolled();
    const front = rows.find((r) => r.pose === 'front');
    if (!front) throw needIdentity();

    if (!file) throw new AppError(400, 'IMAGE_REQUIRED', 'ยังไม่ได้แนบรูป');
    this.checkImage(file);
    const result = await this.analyze(file, pose);

    // เปลี่ยนโมเดลตรวจหน้าแล้ว ท่าเก่าเทียบกับรูปใหม่ไม่ได้ ล้างทิ้งแล้วยืนยันบัตรใหม่
    if (rows.some((r) => r.model !== result.model)) {
      await this.removeQuietly(await this.repo.deleteByUser(user.id));
      await this.users.setIdentity(user.id, null);
      throw needIdentity('ระบบตรวจใบหน้าเปลี่ยนรุ่น ยืนยันตัวตนด้วยบัตรอีกครั้ง');
    }

    // ท่าอื่นเทียบกับหน้าตรงที่ยืนยันกับบัตรแล้ว
    if (cosine(front.embedding, result.embedding) < SAME_PERSON_MIN) {
      throw new AppError(
        422,
        'NOT_SAME_PERSON',
        'ดูเหมือนไม่ใช่คนเดียวกับรูปก่อนหน้า ถ่ายใหม่อีกครั้ง',
      );
    }

    await this.store(
      user.id,
      pose,
      result,
      file,
      rows.find((r) => r.pose === pose),
    );
    return toStatus(user, [...rows.map((r) => r.pose), pose]);
  }

  // แอดมินล้างใบหน้าให้ลงทะเบียนใหม่ ถ้านักศึกษาขอถอนความยินยอมให้ส่ง withdraw ด้วย
  async reset(userId: string, { withdraw = false } = {}): Promise<void> {
    if (!UUID.test(userId) || !(await this.repo.userExists(userId))) {
      throw new AppError(404, 'USER_NOT_FOUND', 'ไม่พบผู้ใช้นี้');
    }
    const rowPaths = await this.repo.deleteByUser(userId);
    await this.users.setIdentity(userId, null);
    if (withdraw) await this.users.clearConsent(userId);

    // ลบทุกไฟล์ในโฟลเดอร์ของคนนี้ ไม่ใช่แค่ไฟล์ที่แถวชี้ถึง ไฟล์ค้างจากการถ่ายซ้ำก็ต้องหายด้วย
    // ลบไม่ครบให้ error แอดมินกดซ้ำได้ รอบหน้าจะหาไฟล์จากโฟลเดอร์เจออีก
    try {
      const paths = new Set([...rowPaths, ...(await this.repo.listImages(userId))]);
      await this.repo.removeImages([...paths]);
    } catch {
      throw new AppError(503, 'FACE_IMAGES_LEFT', 'ลบรูปใบหน้าไม่ครบ ลองรีเซ็ตอีกครั้ง');
    }
  }

  private checkAccount(user: AppUser) {
    if (!user.studentId) throw notAStudent();
    if (!user.pdpaConsentAt) {
      throw new AppError(403, 'CONSENT_REQUIRED', 'ต้องยอมรับเรื่องเก็บข้อมูลใบหน้าก่อน');
    }
  }

  private checkImage(file: UploadedImage) {
    if (!EXTENSIONS[file.mimetype] || !looksLike(file.mimetype, file.buffer)) {
      throw new AppError(400, 'UNSUPPORTED_IMAGE', 'ส่งได้เฉพาะรูป JPG หรือ PNG');
    }
  }

  private async analyze(file: UploadedImage, pose: Pose): Promise<EnrollResult> {
    const result = await this.face.enroll(file.buffer, file.mimetype);
    if (!result.pose) {
      this.logger.warn('face service ไม่ส่งมุมหน้ามา');
      throw new AppError(
        503,
        'FACE_SERVICE_UNAVAILABLE',
        'ระบบตรวจใบหน้าใช้งานไม่ได้ตอนนี้ ลองใหม่อีกครั้ง',
      );
    }
    const angle = checkPose(pose, result.pose);
    if (!angle.ok) throw new AppError(422, 'WRONG_POSE', angle.hint);
    return result;
  }

  // ชื่อไฟล์ใหม่ทุกครั้ง บันทึกแถวก่อนแล้วค่อยลบไฟล์เก่า แถวจะไม่ชี้ไปไฟล์ที่ไม่มี
  private async store(
    userId: string,
    pose: Pose,
    result: EnrollResult,
    file: UploadedImage,
    old: FaceRow | undefined,
  ) {
    // เก็บรูปครอปหน้าจาก face service ไม่เก็บรูปเต็ม (service รุ่นเก่าไม่มีครอป ใช้รูปเดิม)
    const image = result.crop
      ? { buffer: Buffer.from(result.crop, 'base64'), mimetype: 'image/jpeg' }
      : file;
    const imagePath = `${userId}/${pose}-${randomUUID()}.${EXTENSIONS[image.mimetype]}`;
    await this.repo.uploadImage(imagePath, image.buffer, image.mimetype);
    try {
      await this.repo.savePose(userId, {
        pose,
        imagePath,
        embedding: result.embedding,
        model: result.model,
      });
    } catch (error) {
      await this.removeQuietly([imagePath]);
      throw error instanceof AppError ? error : dbError();
    }
    if (old) await this.removeQuietly([old.imagePath]);
  }

  private async removeQuietly(paths: string[]): Promise<void> {
    await this.repo.removeImages(paths).catch((error: unknown) => {
      this.logger.warn(`ลบรูปใบหน้าไม่ครบ ${paths.join(', ')}: ${String(error)}`);
    });
  }
}

function toStatus(user: AppUser, poses: Pose[]): FaceStatus {
  const done = new Set(poses);
  const verified = Boolean(user.identityVerifiedAt);
  return {
    done: POSES.filter((p) => done.has(p)),
    complete: verified && isComplete(done),
    verified,
  };
}
