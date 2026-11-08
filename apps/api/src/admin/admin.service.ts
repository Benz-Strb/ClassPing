import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { Role } from '../auth/role-from-email.js';
import { hashToken, newToken } from '../camera/camera-token.js';
import { AppError } from '../common/app-error.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { parseBody } from '../common/validate.js';
import {
  ADMIN_REPO,
  type AdminRepo,
  type AdminUser,
  type CameraView,
  type RoomView,
} from './admin.repo.js';

const uuid = z.uuid({ error: 'รหัสไม่ถูกต้อง' });
const roleSchema = z.object({ role: z.enum(['student', 'teacher', 'admin']) });
const cameraKindSchema = z.object({
  kind: z
    .enum(['front', 'door'], { error: 'ชนิดกล้องต้องเป็น front หรือ door' })
    .default('front'),
});
const roomSchema = z.object({
  name: z
    .string({ error: 'กรุณาใส่ชื่อห้อง' })
    .trim()
    .min(1, { error: 'กรุณาใส่ชื่อห้อง' })
    .max(100, { error: 'ชื่อห้องยาวเกิน 100 ตัว' }),
});

@Injectable()
export class AdminService {
  constructor(
    @Inject(ADMIN_REPO) private readonly repo: AdminRepo,
    @Inject(APP_CONFIG) private readonly config?: AppConfig,
  ) {}

  listUsers(): Promise<AdminUser[]> {
    return this.repo.listUsers();
  }

  async changeRole(id: string, body: unknown): Promise<AdminUser> {
    const userId = parseBody(uuid, id);
    const { role } = parseBody(roleSchema, body);
    // เมลใน ADMIN_EMAILS ถูกยกกลับเป็นแอดมินทุกคำขอ เปลี่ยนแล้วไม่มีผลจริง
    if (role !== 'admin') {
      const target = await this.repo.findUser(userId);
      const locked = (this.config?.adminEmails ?? []).includes(
        target?.email.trim().toLowerCase() ?? '',
      );
      if (locked) {
        throw new AppError(
          400,
          'ADMIN_EMAIL_LOCKED',
          'เมลนี้ถูกกำหนดเป็นผู้ดูแลระบบในการตั้งค่าเซิร์ฟเวอร์ เปลี่ยนบทบาทไม่ได้',
        );
      }
    }
    const user = await this.repo.updateUserRole(userId, role as Role);
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'ไม่พบผู้ใช้นี้');
    return user;
  }

  listRooms(): Promise<RoomView[]> {
    return this.repo.listRooms();
  }

  async createRoom(body: unknown): Promise<RoomView> {
    const { name } = parseBody(roomSchema, body);
    return await this.repo.createRoom(name);
  }

  listCameras(): Promise<CameraView[]> {
    return this.repo.listCameras();
  }

  async createCameraToken(
    roomId: string,
    body?: unknown,
  ): Promise<{ cameraId: string; roomId: string; token: string }> {
    const id = parseBody(uuid, roomId);
    const { kind } = parseBody(cameraKindSchema, body ?? {});
    if (!(await this.repo.findRoom(id))) {
      throw new AppError(404, 'ROOM_NOT_FOUND', 'ไม่พบห้องนี้');
    }
    const token = newToken();
    const camera = await this.repo.saveCameraToken(
      id,
      hashToken(token),
      kind,
    );
    return { cameraId: camera.id, roomId: camera.roomId, token };
  }
}
