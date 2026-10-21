import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppError } from '../common/app-error.js';
import { dbError } from '../common/db-error.js';
import { FaceClient } from '../face/face.client.js';
import { UsersService, type AppUser } from '../users/users.service.js';
import { ENROLLMENT_REPO, type EnrollmentRepo } from './enrollment.repo.js';
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
  complete: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const notAStudent = () =>
  new AppError(403, 'NOT_A_STUDENT', 'ลงทะเบียนใบหน้าได้เฉพาะบัญชีนักศึกษา');

@Injectable()
export class EnrollmentService {
  private readonly logger = new Logger(EnrollmentService.name);

  constructor(
    @Inject(ENROLLMENT_REPO) private readonly repo: EnrollmentRepo,
    private readonly users: UsersService,
    private readonly face: FaceClient,
  ) {}

  async consent(user: AppUser): Promise<AppUser> {
    if (!user.studentId) throw notAStudent();
    return this.users.setConsent(user.id);
  }

  async status(user: AppUser): Promise<FaceStatus> {
    if (!user.studentId) throw notAStudent();
    const done = new Set((await this.repo.listByUser(user.id)).map((r) => r.pose));
    return { done: POSES.filter((p) => done.has(p)), complete: isComplete(done) };
  }

  // ถ่ายทีละท่า ท่าเดิมถ่ายซ้ำได้จนกว่าจะครบ รูปที่ไม่ผ่านไม่ถูกเก็บ
  async savePose(
    user: AppUser,
    poseName: string,
    file: UploadedImage | undefined,
  ): Promise<FaceStatus> {
    if (!user.studentId) throw notAStudent();
    if (!user.pdpaConsentAt) {
      throw new AppError(403, 'CONSENT_REQUIRED', 'ต้องยอมรับเรื่องเก็บข้อมูลใบหน้าก่อน');
    }
    if (!isPose(poseName)) throw new AppError(404, 'NOT_FOUND', 'ไม่มีท่านี้');
    const pose = poseName;

    const rows = await this.repo.listByUser(user.id);
    if (isComplete(rows.map((r) => r.pose))) {
      throw new AppError(
        409,
        'ALREADY_ENROLLED',
        'ลงทะเบียนใบหน้าไปแล้ว ถ้าต้องการลงใหม่ติดต่อผู้ดูแลระบบ',
      );
    }
    const front = rows.find((r) => r.pose === 'front');
    if (pose !== 'front' && !front) {
      throw new AppError(409, 'FRONT_FIRST', 'ถ่ายหน้าตรงก่อน');
    }

    if (!file) throw new AppError(400, 'IMAGE_REQUIRED', 'ยังไม่ได้แนบรูป');
    const ext = EXTENSIONS[file.mimetype];
    if (!ext) throw new AppError(400, 'UNSUPPORTED_IMAGE', 'ส่งได้เฉพาะรูป JPG หรือ PNG');

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

    // ท่าอื่นเทียบกับหน้าตรง ถ้าถ่ายหน้าตรงใหม่ให้เทียบกับทุกท่าที่มี
    const others = pose === 'front' ? rows.filter((r) => r.pose !== 'front') : [front!];
    if (others.some((r) => cosine(r.embedding, result.embedding) < SAME_PERSON_MIN)) {
      throw new AppError(
        422,
        'NOT_SAME_PERSON',
        'ดูเหมือนไม่ใช่คนเดียวกับรูปก่อนหน้า ถ่ายใหม่อีกครั้ง',
      );
    }

    // ชื่อไฟล์ใหม่ทุกครั้ง บันทึกแถวก่อนแล้วค่อยลบไฟล์เก่า แถวจะไม่ชี้ไปไฟล์ที่ไม่มี
    const imagePath = `${user.id}/${pose}-${randomUUID()}.${ext}`;
    await this.repo.uploadImage(imagePath, file.buffer, file.mimetype);
    try {
      await this.repo.savePose(user.id, {
        pose,
        imagePath,
        embedding: result.embedding,
        model: result.model,
      });
    } catch (error) {
      await this.removeQuietly([imagePath]);
      throw error instanceof AppError ? error : dbError();
    }

    const old = rows.find((r) => r.pose === pose);
    if (old) await this.removeQuietly([old.imagePath]);

    const done = new Set([...rows.map((r) => r.pose), pose]);
    return { done: POSES.filter((p) => done.has(p)), complete: isComplete(done) };
  }

  // แอดมินล้างใบหน้าให้ลงทะเบียนใหม่ หรือเมื่อนักศึกษาขอถอนความยินยอม
  async reset(userId: string): Promise<void> {
    if (!UUID.test(userId) || !(await this.repo.userExists(userId))) {
      throw new AppError(404, 'USER_NOT_FOUND', 'ไม่พบผู้ใช้นี้');
    }
    // แถวหายแล้วคือรีเซ็ตแล้ว ไฟล์ที่ลบไม่ออกไม่มีอะไรชี้ถึง
    await this.removeQuietly(await this.repo.deleteByUser(userId));
  }

  private async removeQuietly(paths: string[]): Promise<void> {
    await this.repo.removeImages(paths).catch((error: unknown) => {
      this.logger.warn(`ลบรูปใบหน้าไม่ครบ ${paths.join(', ')}: ${String(error)}`);
    });
  }
}
