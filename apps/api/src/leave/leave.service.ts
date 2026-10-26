import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AppError } from '../common/app-error.js';
import { FaceClient } from '../face/face.client.js';
import type { AppUser } from '../users/users.service.js';
import { LEAVE_REPO, type LeaveRepo, type LeaveRequestView } from './leave.repo.js';

const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;
const EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

export interface LeaveEvidence {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

@Injectable()
export class LeaveService {
  constructor(
    @Inject(LEAVE_REPO) private readonly repo: LeaveRepo,
    private readonly face: FaceClient,
  ) {}

  async submit(user: AppUser, sessionId: string, reason: string, evidence?: LeaveEvidence) {
    if (!user.studentId) throw new AppError(403, 'STUDENT_ONLY', 'ยื่นลาได้เฉพาะบัญชีนักศึกษา');
    const cleanReason = reason.trim();
    if (!cleanReason) throw new AppError(400, 'REASON_REQUIRED', 'กรุณาระบุเหตุผลการลา');
    if (!evidence) throw new AppError(400, 'EVIDENCE_REQUIRED', 'กรุณาแนบหลักฐานการลา');
    if (!EXTENSIONS[evidence.mimetype]) {
      throw new AppError(400, 'UNSUPPORTED_EVIDENCE', 'รองรับเฉพาะไฟล์ PDF, JPG หรือ PNG');
    }
    if (evidence.size <= 0 || evidence.size > MAX_EVIDENCE_BYTES) {
      throw new AppError(413, 'EVIDENCE_TOO_LARGE', 'ไฟล์หลักฐานต้องมีขนาดไม่เกิน 10 MB');
    }
    if (!(await this.repo.studentCanRequest(user.id, sessionId))) {
      throw new AppError(404, 'SESSION_NOT_FOUND', 'ไม่พบคาบเรียนที่นักศึกษาลงทะเบียนไว้');
    }

    const ocr = await this.face.readLeaveDocument(evidence.buffer, evidence.mimetype);
    const request = await this.repo.createRequest({
      studentId: user.id,
      sessionId,
      reason: cleanReason,
    });
    const path = `${user.id}/${request.id}-${randomUUID()}.${EXTENSIONS[evidence.mimetype]}`;
    try {
      await this.repo.uploadEvidence(path, evidence.buffer, evidence.mimetype);
      await this.repo.createAttachment({
        requestId: request.id,
        path,
        fileName: evidence.originalname,
        mime: evidence.mimetype,
        size: evidence.size,
      });
    } catch (error) {
      await this.repo.deleteEvidence(path).catch(() => undefined);
      await this.repo.deleteRequest(request.id).catch(() => undefined);
      throw error;
    }

    return { id: request.id, status: 'pending', ocr };
  }

  async review(
    user: AppUser,
    requestId: string,
    decision: 'approved' | 'rejected',
    reviewNote?: string,
  ) {
    if (user.role !== 'teacher') {
      throw new AppError(403, 'FORBIDDEN', 'ไม่มีสิทธิ์ตรวจคำขอลา');
    }
    try {
      await this.repo.reviewRequest(requestId, user.id, decision, reviewNote?.trim() || null);
    } catch (error) {
      if (error instanceof Error && error.message === 'LEAVE_REQUEST_NOT_FOUND') {
        throw new AppError(404, 'LEAVE_REQUEST_NOT_FOUND', 'ไม่พบคำขอลา');
      }
      if (error instanceof Error && error.message === 'LEAVE_REQUEST_NOT_PENDING') {
        throw new AppError(409, 'LEAVE_REQUEST_NOT_PENDING', 'คำขอลานี้ถูกตรวจไปแล้ว');
      }
      if (error instanceof Error && error.message === 'LEAVE_REQUEST_FORBIDDEN') {
        throw new AppError(403, 'FORBIDDEN', 'ไม่มีสิทธิ์ตรวจคำขอลาของวิชานี้');
      }
      throw error;
    }
    return { id: requestId, status: decision };
  }

  listMine(user: AppUser): Promise<LeaveRequestView[]> {
    if (!user.studentId) throw new AppError(403, 'STUDENT_ONLY', 'ดูคำขอลาได้เฉพาะบัญชีนักศึกษา');
    return this.repo.listByStudent(user.id);
  }

  listForTeacher(user: AppUser): Promise<LeaveRequestView[]> {
    if (user.role !== 'teacher') {
      throw new AppError(403, 'FORBIDDEN', 'ดูคิวตรวจคำขอลาได้เฉพาะอาจารย์');
    }
    return this.repo.listForTeacher(user.id);
  }

  async evidenceUrl(user: AppUser, requestId: string): Promise<{ url: string }> {
    if (user.role !== 'student' && user.role !== 'teacher') {
      throw new AppError(403, 'FORBIDDEN', 'ไม่มีสิทธิ์ดูหลักฐานการลา');
    }
    try {
      return { url: await this.repo.signedEvidenceUrl(requestId, user.id, user.role) };
    } catch (error) {
      if (error instanceof Error && error.message === 'LEAVE_REQUEST_NOT_FOUND') {
        throw new AppError(404, 'LEAVE_REQUEST_NOT_FOUND', 'ไม่พบคำขอลา');
      }
      if (error instanceof Error && error.message === 'LEAVE_REQUEST_FORBIDDEN') {
        throw new AppError(403, 'FORBIDDEN', 'ไม่มีสิทธิ์ดูหลักฐานคำขอลานี้');
      }
      if (error instanceof Error && error.message === 'EVIDENCE_NOT_FOUND') {
        throw new AppError(404, 'EVIDENCE_NOT_FOUND', 'ไม่พบไฟล์หลักฐาน');
      }
      throw error;
    }
  }
}
