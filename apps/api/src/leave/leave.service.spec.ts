import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../common/app-error.js';
import type { FaceClient } from '../face/face.client.js';
import type { AppUser } from '../users/users.service.js';
import { LeaveController } from './leave.controller.js';
import type { LeaveRepo, LeaveSessionOption } from './leave.repo.js';
import { LeaveService } from './leave.service.js';

const student: AppUser = {
  id: 'student-user',
  email: 'student@dpu.ac.th',
  fullName: 'นักศึกษา ทดสอบ',
  role: 'student',
  studentId: '66000001',
  pdpaConsentAt: null,
  identityVerifiedAt: null,
};

const SESSION_ID = '11111111-1111-4111-8111-111111111111';

const teacher: AppUser = {
  ...student,
  id: 'teacher-user',
  role: 'teacher',
  studentId: null,
};

const session: LeaveSessionOption = {
  id: SESSION_ID,
  courseId: 'course-1',
  courseCode: 'CS101',
  courseName: 'พื้นฐานการเขียนโปรแกรม',
  section: '1',
  kind: 'class',
  title: null,
  onDate: '2026-10-28',
  startsAt: '2026-10-28T02:00:00.000Z',
  endsAt: '2026-10-28T05:00:00.000Z',
  roomName: 'LAB 1',
};

function setup() {
  const repo = {
    listEligibleSessions: vi.fn(async () => [session]),
    studentCanRequest: vi.fn(async () => true),
    createRequest: vi.fn(async () => ({ id: 'leave-1' })),
    deleteRequest: vi.fn(async () => undefined),
    uploadEvidence: vi.fn(async () => undefined),
    deleteEvidence: vi.fn(async () => undefined),
    createAttachment: vi.fn(async () => undefined),
    reviewRequest: vi.fn(async () => undefined),
    listByStudent: vi.fn(async () => []),
    listForTeacher: vi.fn(async () => []),
    signedEvidenceUrl: vi.fn(async () => 'https://example.test/evidence'),
  } satisfies LeaveRepo;
  const face = {
    readLeaveDocument: vi.fn(async () => ({
      lines: [{ text: 'ใบลาป่วย', score: null }],
    })),
  };
  return {
    repo,
    face,
    service: new LeaveService(repo, face as unknown as FaceClient),
  };
}

const evidence = {
  buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]),
  mimetype: 'image/png',
  originalname: 'leave.png',
  size: 9,
};

describe('LeaveService', () => {
  it('คืนเฉพาะคาบที่นักศึกษามีสิทธิ์ยื่นลา', async () => {
    const { service, repo } = setup();

    await expect(service.listSessions(student)).resolves.toEqual([session]);
    expect(repo.listEligibleSessions).toHaveBeenCalledWith('student-user');
  });

  it('ไม่เรียก OCR เมื่อ session ไม่ใช่วิชาที่ลงทะเบียน', async () => {
    const { service, repo, face } = setup();
    repo.studentCanRequest.mockResolvedValue(false);

    await expect(
      service.submit(
        student,
        '99999999-9999-4999-8999-999999999999',
        'ป่วย',
        evidence,
      ),
    ).rejects.toMatchObject({
      status: 404,
      code: 'SESSION_NOT_FOUND',
    });
    expect(face.readLeaveDocument).not.toHaveBeenCalled();
    expect(repo.createRequest).not.toHaveBeenCalled();
  });

  it('ข้อมูลคำขอไม่ครบหรือ sessionId ไม่ใช่ UUID ได้ 400 โดยไม่ถามฐานข้อมูล', async () => {
    const { service, repo } = setup();

    for (const [sessionId, reason] of [
      ['', 'ป่วย'],
      ['not-a-uuid', 'ป่วย'],
      [SESSION_ID, undefined],
      [SESSION_ID, 'x'.repeat(1001)],
    ] as Array<[string, string | undefined]>) {
      await expect(
        service.submit(student, sessionId, reason as string, evidence),
      ).rejects.toMatchObject({ status: 400 });
    }
    expect(repo.studentCanRequest).not.toHaveBeenCalled();
  });

  it('ปฏิเสธไฟล์ที่ Content-Type ไม่ตรงกับข้อมูลจริง', async () => {
    const { service, repo } = setup();

    await expect(
      service.submit(student, SESSION_ID, 'ป่วย', {
        ...evidence,
        buffer: Buffer.from('not a png'),
      }),
    ).rejects.toMatchObject({ status: 400, code: 'INVALID_EVIDENCE' });
    expect(repo.createRequest).not.toHaveBeenCalled();
  });

  it('ตอบ 409 เมื่อมีคำขอลาของคาบนี้แล้ว', async () => {
    const { service, repo } = setup();
    repo.createRequest.mockRejectedValue(new Error('LEAVE_REQUEST_DUPLICATE'));

    await expect(
      service.submit(student, SESSION_ID, 'ป่วย', evidence),
    ).rejects.toMatchObject({
      status: 409,
      code: 'LEAVE_REQUEST_DUPLICATE',
    });
  });

  it('Typhoon ล้มเหลวแล้วยังบันทึกคำขอและหลักฐานเพื่อให้อาจารย์ตรวจเอง', async () => {
    const { service, repo, face } = setup();
    face.readLeaveDocument.mockRejectedValue(new Error('typhoon unavailable'));

    await expect(
      service.submit(student, SESSION_ID, 'ป่วย', evidence),
    ).resolves.toMatchObject({
      id: 'leave-1',
      status: 'pending',
      ocrStatus: 'failed',
      ocr: null,
    });
    expect(repo.createRequest).toHaveBeenCalledWith({
      studentId: 'student-user',
      sessionId: SESSION_ID,
      reason: 'ป่วย',
      ocrText: '',
      ocrStatus: 'failed',
    });
    expect(repo.uploadEvidence).toHaveBeenCalledOnce();
    expect(repo.createAttachment).toHaveBeenCalledOnce();
  });

  it('Storage ล้มเหลวแล้วล้างไฟล์และคำขอ แต่ไม่กลืน error', async () => {
    const { service, repo } = setup();
    const storageError = new Error('storage unavailable');
    repo.uploadEvidence.mockRejectedValue(storageError);

    await expect(
      service.submit(student, SESSION_ID, 'ป่วย', evidence),
    ).rejects.toBe(storageError);
    expect(repo.deleteEvidence).toHaveBeenCalledOnce();
    expect(repo.deleteRequest).toHaveBeenCalledWith('leave-1');
  });

  it('requestId ไม่ใช่ UUID ได้ 404 โดยไม่ถามฐานข้อมูล', async () => {
    const { service, repo } = setup();

    await expect(
      service.review(teacher, 'bad-id', 'approved'),
    ).rejects.toMatchObject({
      status: 404,
      code: 'LEAVE_REQUEST_NOT_FOUND',
    });
    await expect(service.evidenceUrl(student, 'bad-id')).rejects.toMatchObject({
      status: 404,
      code: 'LEAVE_REQUEST_NOT_FOUND',
    });
    expect(repo.reviewRequest).not.toHaveBeenCalled();
    expect(repo.signedEvidenceUrl).not.toHaveBeenCalled();
  });
});

describe('LeaveController', () => {
  it('decision ที่ไม่รองรับได้ 400 แบบ error กลาง', () => {
    const { service } = setup();
    const controller = new LeaveController(service);

    expect(() =>
      controller.review(teacher, 'leave-1', 'waiting' as 'approved'),
    ).toThrowError(AppError);
    expect(() =>
      controller.review(teacher, 'leave-1', 'waiting' as 'approved'),
    ).toThrowError(
      expect.objectContaining({ status: 400, code: 'BAD_REQUEST' }),
    );
  });
});
