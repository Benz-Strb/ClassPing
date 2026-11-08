import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AppError } from '../common/app-error.js';
import { looksLike } from '../common/image-type.js';
import { LeaveOcrClient } from './leave-ocr.client.js';
import type { AppUser } from '../users/users.service.js';
import {
  LEAVE_REPO,
  type LeaveRepo,
  type LeaveRequestView,
  type LeaveSessionOption,
} from './leave.repo.js';

export const MAX_EVIDENCE_BYTES = 25 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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

const MAX_REVIEW_NOTE = 1000;

// หมายเหตุเป็นข้อความเท่านั้น ว่างถือว่าไม่มี
function parseReviewNote(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new AppError(400, 'BAD_REQUEST', 'หมายเหตุต้องเป็นข้อความ');
  }
  const note = value.trim();
  if (note.length > MAX_REVIEW_NOTE) {
    throw new AppError(400, 'BAD_REQUEST', `หมายเหตุยาวเกิน ${MAX_REVIEW_NOTE} ตัวอักษร`);
  }
  return note || null;
}

export function extractLeaveReason(text: string): string {
  if (!text) return '';
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const labelRegex =
    /^(?:เหตุผล(?:การลา)?|สาเหตุ|เนื่องจาก|เนื่องด้วย|ขอลาเนื่องจาก|การวินิจฉัย(?:โรค)?|วินิจฉัย(?:โรค)?(?:ว่า)?|อาการ(?:สำคัญ)?(?:ที่พบ)?|โรค|ป่วยเป็น|ป่วยด้วย|มีความจำเป็นต้อง|Diagnosis|Dx|Symptoms|Reason)\s*[:：\-–—.]?\s*(.*)$/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(labelRegex);
    if (match) {
      let content = match[1]?.trim();
      if (!content && i + 1 < lines.length) {
        const next = lines[i + 1].trim();
        if (
          !/^(?:ชื่อ|รหัสนักศึกษา|รายวิชา|วันที่|แพทย์|โรงพยาบาล|ลงชื่อ|Date|Doctor|Hospital|Name)/i.test(
            next,
          )
        ) {
          content = next;
        }
      }
      if (content) {
        return content
          .replace(/\s*(?:ClassPing|หน้า\s*\d+|Page\s*\d+).*$/i, '')
          .trim();
      }
    }
  }

  // Check lines with recommendation / rest
  for (const line of lines) {
    const match = line.match(
      /(?:สมควรให้|เห็นควรให้|ให้|แนะนำให้)(?:หยุดพักรักษาตัว|พักรักษาตัว|หยุดเรียน|พักฟื้น|หยุดงาน)\s*(.*)/i,
    );
    if (match) return line;
  }

  // Check illness keywords
  const illnessRegex =
    /(?:ไข้|หวัด|เจ็บคอ|ปวดท้อง|ท้องเสีย|อาหารเป็นพิษ|ปวดศีรษะ|ปวดหัว|คลื่นไส้|อาเจียน|อุบัติเหตุ|ผ่าตัด|ติดเชื้อ|กล้ามเนื้อ|กักตัว|โควิด|fever|headache|diarrhea|pharyngitis|gastroenteritis)/i;
  for (const line of lines) {
    if (
      illnessRegex.test(line) &&
      !/^(?:ข้อมูลสมมติ|หลักฐาน|ใบรับรองแพทย์|โรงพยาบาล|คลินิก|มหาวิทยาลัย|Medical)/i.test(
        line,
      )
    ) {
      return line
        .replace(/\s*(?:ClassPing|หน้า\s*\d+|Page\s*\d+).*$/i, '')
        .trim();
    }
  }

  // Fallback: first non-header line
  const filtered = lines.filter(
    (l) =>
      !/^(?:ข้อมูลสมมติ|หลักฐาน|มหาวิทยาลัย|โรงพยาบาล|คลินิก|ชื่อ|รหัสนักศึกษา|รายวิชา|วันที่|วันที่ลา|ClassPing|หน้า|Page)/i.test(
        l,
      ),
  );
  const fallback = filtered[0] || lines[0] || '';
  return fallback.slice(0, 1000).trim();
}

@Injectable()
export class LeaveService {
  constructor(
    @Inject(LEAVE_REPO) private readonly repo: LeaveRepo,
    private readonly ocr: LeaveOcrClient,
  ) {}

  private validateEvidence(
    evidence?: LeaveEvidence,
  ): asserts evidence is LeaveEvidence {
    if (!evidence)
      throw new AppError(400, 'EVIDENCE_REQUIRED', 'กรุณาแนบหลักฐานการลา');
    if (!EXTENSIONS[evidence.mimetype]) {
      throw new AppError(
        400,
        'UNSUPPORTED_EVIDENCE',
        'รองรับเฉพาะไฟล์ PDF, JPG หรือ PNG',
      );
    }
    if (evidence.size <= 0 || evidence.size > MAX_EVIDENCE_BYTES) {
      throw new AppError(
        413,
        'EVIDENCE_TOO_LARGE',
        'ไฟล์หลักฐานต้องมีขนาดไม่เกิน 25 MB',
      );
    }
    const validFile =
      evidence.mimetype === 'application/pdf'
        ? evidence.buffer.subarray(0, 5).toString() === '%PDF-'
        : looksLike(evidence.mimetype, evidence.buffer);
    if (!validFile)
      throw new AppError(400, 'INVALID_EVIDENCE', 'ชนิดไฟล์หลักฐานไม่ถูกต้อง');
  }

  async preview(user: AppUser, sessionId: string, evidence?: LeaveEvidence) {
    if (user.role !== 'student' || !user.studentId)
      throw new AppError(403, 'STUDENT_ONLY', 'ยื่นลาได้เฉพาะบัญชีนักศึกษา');
    if (typeof sessionId !== 'string' || !UUID.test(sessionId))
      throw new AppError(400, 'BAD_REQUEST', 'กรุณาเลือกคาบที่ต้องการลา');
    this.validateEvidence(evidence);
    if (!(await this.repo.studentCanRequest(user.id, sessionId)))
      throw new AppError(
        404,
        'SESSION_NOT_FOUND',
        'ไม่พบคาบเรียนที่นักศึกษาลงทะเบียนไว้',
      );
    const ocr = await this.ocr.readLeaveDocument(
      evidence.buffer,
      evidence.mimetype,
    );
    const text = ocr.lines
      .map((line) => line.text)
      .join('\n')
      .trim();
    const reason = extractLeaveReason(text) || text.slice(0, 1000);
    return { text, reason };
  }

  async submit(
    user: AppUser,
    sessionId: string,
    reason: string,
    evidence?: LeaveEvidence,
  ) {
    if (user.role !== 'student' || !user.studentId)
      throw new AppError(403, 'STUDENT_ONLY', 'ยื่นลาได้เฉพาะบัญชีนักศึกษา');
    if (typeof sessionId !== 'string' || !UUID.test(sessionId))
      throw new AppError(400, 'BAD_REQUEST', 'กรุณาเลือกคาบที่ต้องการลา');
    const cleanReason = typeof reason === 'string' ? reason.trim() : '';
    if (!cleanReason)
      throw new AppError(400, 'REASON_REQUIRED', 'กรุณาระบุเหตุผลการลา');
    if (cleanReason.length > 1000)
      throw new AppError(
        400,
        'BAD_REQUEST',
        'เหตุผลการลายาวเกิน 1000 ตัวอักษร',
      );
    this.validateEvidence(evidence);
    if (!(await this.repo.studentCanRequest(user.id, sessionId))) {
      throw new AppError(
        404,
        'SESSION_NOT_FOUND',
        'ไม่พบคาบเรียนที่นักศึกษาลงทะเบียนไว้',
      );
    }

    // ซ้ำอยู่แล้วไม่ต้องเสีย OCR ตัวกันจริงคือ unique index ตอนสร้างคำขอ
    if (await this.repo.hasActiveRequest(user.id, sessionId)) {
      throw new AppError(
        409,
        'LEAVE_REQUEST_DUPLICATE',
        'ส่งคำขอลาสำหรับคาบนี้แล้ว',
      );
    }

    let ocr: Awaited<ReturnType<LeaveOcrClient['readLeaveDocument']>> | null = null;
    let ocrStatus: 'completed' | 'failed' = 'failed';
    try {
      ocr = await this.ocr.readLeaveDocument(
        evidence.buffer,
        evidence.mimetype,
      );
      ocrStatus = 'completed';
    } catch {
      // OCR เป็นข้อมูลช่วยตรวจ หลักฐานยังต้องส่งให้อาจารย์ตรวจเองได้เมื่อบริการภายนอกล่ม
    }
    let request;
    try {
      request = await this.repo.createRequest({
        studentId: user.id,
        sessionId,
        reason: cleanReason,
        ocrText: ocr?.lines.map((line) => line.text).join('\n') ?? '',
        ocrStatus,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'LEAVE_REQUEST_DUPLICATE'
      ) {
        throw new AppError(
          409,
          'LEAVE_REQUEST_DUPLICATE',
          'ส่งคำขอลาสำหรับคาบนี้แล้ว',
        );
      }
      throw error;
    }
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

    return { id: request.id, status: 'pending', ocrStatus, ocr };
  }

  listSessions(user: AppUser): Promise<LeaveSessionOption[]> {
    if (user.role !== 'student' || !user.studentId)
      throw new AppError(
        403,
        'STUDENT_ONLY',
        'ดูคาบเรียนได้เฉพาะบัญชีนักศึกษา',
      );
    return this.repo.listEligibleSessions(user.id);
  }

  async review(
    user: AppUser,
    requestId: string,
    decision: 'approved' | 'rejected',
    rawNote?: unknown,
  ) {
    if (user.role !== 'teacher') {
      throw new AppError(403, 'FORBIDDEN', 'ไม่มีสิทธิ์ตรวจคำขอลา');
    }
    const reviewNote = parseReviewNote(rawNote);
    if (!UUID.test(requestId))
      throw new AppError(404, 'LEAVE_REQUEST_NOT_FOUND', 'ไม่พบคำขอลา');
    try {
      await this.repo.reviewRequest(
        requestId,
        user.id,
        decision,
        reviewNote,
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'LEAVE_REQUEST_NOT_FOUND'
      ) {
        throw new AppError(404, 'LEAVE_REQUEST_NOT_FOUND', 'ไม่พบคำขอลา');
      }
      if (
        error instanceof Error &&
        error.message === 'LEAVE_REQUEST_NOT_PENDING'
      ) {
        throw new AppError(
          409,
          'LEAVE_REQUEST_NOT_PENDING',
          'คำขอลานี้ถูกตรวจไปแล้ว',
        );
      }
      if (
        error instanceof Error &&
        error.message === 'LEAVE_REQUEST_FORBIDDEN'
      ) {
        throw new AppError(403, 'FORBIDDEN', 'ไม่มีสิทธิ์ตรวจคำขอลาของวิชานี้');
      }
      throw error;
    }
    return { id: requestId, status: decision };
  }

  async listStatuses(user: AppUser) {
    if (user.role !== 'admin') {
      throw new AppError(403, 'FORBIDDEN', 'ดูภาพรวมสถานะได้เฉพาะผู้ดูแลระบบ');
    }
    const statuses = await this.repo.listStatuses();
    return statuses.map(({ id, status, createdAt, reviewedAt }) => ({ id, status, createdAt, reviewedAt }));
  }

  listMine(user: AppUser): Promise<LeaveRequestView[]> {
    if (user.role !== 'student' || !user.studentId)
      throw new AppError(403, 'STUDENT_ONLY', 'ดูคำขอลาได้เฉพาะบัญชีนักศึกษา');
    return this.repo.listByStudent(user.id);
  }

  listForTeacher(user: AppUser): Promise<LeaveRequestView[]> {
    if (user.role !== 'teacher') {
      throw new AppError(403, 'FORBIDDEN', 'ดูคิวตรวจคำขอลาได้เฉพาะอาจารย์');
    }
    return this.repo.listForTeacher(user.id);
  }

  async listPending(user: AppUser): Promise<LeaveRequestView[]> {
    const requests = await this.listForTeacher(user);
    return requests.filter((request) => request.status === 'pending');
  }

  async evidenceUrl(
    user: AppUser,
    requestId: string,
  ): Promise<{ url: string }> {
    if (user.role !== 'student' && user.role !== 'teacher') {
      throw new AppError(403, 'FORBIDDEN', 'ไม่มีสิทธิ์ดูหลักฐานการลา');
    }
    if (!UUID.test(requestId))
      throw new AppError(404, 'LEAVE_REQUEST_NOT_FOUND', 'ไม่พบคำขอลา');
    try {
      return {
        url: await this.repo.signedEvidenceUrl(requestId, user.id, user.role),
      };
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'LEAVE_REQUEST_NOT_FOUND'
      ) {
        throw new AppError(404, 'LEAVE_REQUEST_NOT_FOUND', 'ไม่พบคำขอลา');
      }
      if (
        error instanceof Error &&
        error.message === 'LEAVE_REQUEST_FORBIDDEN'
      ) {
        throw new AppError(403, 'FORBIDDEN', 'ไม่มีสิทธิ์ดูหลักฐานคำขอลานี้');
      }
      if (error instanceof Error && error.message === 'EVIDENCE_NOT_FOUND') {
        throw new AppError(404, 'EVIDENCE_NOT_FOUND', 'ไม่พบไฟล์หลักฐาน');
      }
      throw error;
    }
  }
}
