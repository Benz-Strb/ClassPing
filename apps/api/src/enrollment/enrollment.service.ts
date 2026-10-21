import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppError } from '../common/app-error.js';
import { UsersService, type AppUser } from '../users/users.service.js';
import { ENROLLMENT_REPO, type EnrollmentRepo } from './enrollment.repo.js';
import { isComplete, POSES, type Pose } from './pose-check.js';

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

  // แอดมินล้างใบหน้าให้ลงทะเบียนใหม่ หรือเมื่อนักศึกษาขอถอนความยินยอม
  async reset(userId: string): Promise<void> {
    if (!UUID.test(userId) || !(await this.repo.userExists(userId))) {
      throw new AppError(404, 'USER_NOT_FOUND', 'ไม่พบผู้ใช้นี้');
    }
    const paths = await this.repo.deleteByUser(userId);
    // แถวหายแล้วคือรีเซ็ตแล้ว ไฟล์ที่ลบไม่ออกไม่มีอะไรชี้ถึง
    await this.repo.removeImages(paths).catch((error: unknown) => {
      this.logger.warn(`ลบรูปใบหน้าของ ${userId} ไม่ครบ: ${String(error)}`);
    });
  }
}
