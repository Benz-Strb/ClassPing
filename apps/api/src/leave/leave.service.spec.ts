import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../common/app-error.js';
import type { LeaveOcrClient } from './leave-ocr.client.js';
import type { AppUser } from '../users/users.service.js';
import { LeaveController } from './leave.controller.js';
import type { LeaveRepo, LeaveSessionOption } from './leave.repo.js';
import { extractLeaveDraft, documentDetailsSchema } from './leave-draft.js';
import { LeaveService, extractLeaveReason } from './leave.service.js';
import { PreviewLimitGuard, SubmitLimitGuard } from './preview-limit.guard.js';

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
  cancelled: false,
};

function setup() {
  const repo = {
    listStatuses: vi.fn(async () => []),
    listEligibleSessions: vi.fn(async () => [session]),
    studentCanRequest: vi.fn(async () => true),
    hasActiveRequest: vi.fn(async () => false),
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
  const ocr = {
    readLeaveDocument: vi.fn(async () => ({
      lines: [{ text: 'ใบลาป่วย', score: null }],
    })),
  };
  return {
    repo,
    ocr,
    service: new LeaveService(repo, ocr as unknown as LeaveOcrClient),
  };
}

const evidence = {
  buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]),
  mimetype: 'image/png',
  originalname: 'leave.png',
  size: 9,
};

describe('LeaveService', () => {
  it.each(['admin', 'teacher'] as const)('ปฏิเสธ %s แม้มีรหัสนักศึกษา', async (role) => {
    const { service, repo, ocr } = setup();
    const user = { ...student, role };
    expect(() => service.listSessions(user)).toThrow('ดูคาบเรียนได้เฉพาะบัญชีนักศึกษา');
    expect(() => service.listMine(user)).toThrow('ดูคำขอลาได้เฉพาะบัญชีนักศึกษา');
    await expect(service.preview(user, SESSION_ID, evidence)).rejects.toMatchObject({ status: 403 });
    await expect(service.submit(user, SESSION_ID, 'ทดสอบ', evidence)).rejects.toMatchObject({ status: 403 });
    expect(repo.studentCanRequest).not.toHaveBeenCalled();
    expect(repo.createRequest).not.toHaveBeenCalled();
    expect(ocr.readLeaveDocument).not.toHaveBeenCalled();
  });

  it('ไม่ใช้ข้อความที่ไม่รู้จักเป็นเหตุผล แต่เก็บต้นฉบับให้ตรวจ', async () => {
    const { service, ocr } = setup();
    const text = 'ก'.repeat(1200);
    ocr.readLeaveDocument.mockResolvedValue({
      lines: [{ text, score: null }],
    });
    await expect(
      service.preview(student, SESSION_ID, evidence),
    ).resolves.toEqual({
      text,
      ...extractLeaveDraft(text),
    });
  });

  it('บันทึกฟิลด์ที่ผู้ใช้ตรวจแก้แล้วแยกจากข้อความ OCR', async () => {
    const { service, repo } = setup();
    const details = { facility: 'คลินิกทดสอบ', documentDate: '2026-11-08', leaveStartDate: '2026-11-08', leaveEndDate: '2026-11-09' };
    await service.submit(student, SESSION_ID, 'เหตุผลที่แก้แล้ว', evidence, details);
    expect(repo.createRequest).toHaveBeenCalledWith(expect.objectContaining({ reason: 'เหตุผลที่แก้แล้ว', documentDetails: details }));
  });

  it('ปฏิเสธฟิลด์วันที่ผิดก่อนเรียก OCR หรือเขียนฐาน', async () => {
    const { service, repo, ocr } = setup();
    await expect(service.submit(student, SESSION_ID, 'ป่วย', evidence, { documentDate: '2026-02-30' })).rejects.toMatchObject({ status: 400 });
    expect(ocr.readLeaveDocument).not.toHaveBeenCalled();
    expect(repo.createRequest).not.toHaveBeenCalled();
  });

  it('ปฏิเสธร่างเมื่อไม่มีหลักฐาน ไฟล์ใหญ่ หรือไม่ใช่นักศึกษา', async () => {
    const { service } = setup();
    await expect(service.preview(student, SESSION_ID)).rejects.toMatchObject({
      code: 'EVIDENCE_REQUIRED',
    });
    await expect(
      service.preview(student, SESSION_ID, {
        ...evidence,
        size: 25 * 1024 * 1024 + 1,
      }),
    ).rejects.toMatchObject({ status: 413 });
    await expect(
      service.preview(teacher, SESSION_ID, evidence),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('อ่านหลักฐานเป็นร่างโดยไม่สร้างคำขอหรือเก็บไฟล์', async () => {
    const { service, repo } = setup();
    await expect(
      service.preview(student, SESSION_ID, evidence),
    ).resolves.toEqual({
      text: 'ใบลาป่วย',
      ...extractLeaveDraft('ใบลาป่วย'),
    });
    expect(repo.createRequest).not.toHaveBeenCalled();
    expect(repo.uploadEvidence).not.toHaveBeenCalled();
  });

  it('ไม่อ่านร่างของคาบที่นักศึกษาไม่มีสิทธิ์', async () => {
    const { service, repo, ocr } = setup();
    repo.studentCanRequest.mockResolvedValue(false);
    await expect(
      service.preview(student, SESSION_ID, evidence),
    ).rejects.toMatchObject({
      status: 404,
      code: 'SESSION_NOT_FOUND',
    });
    expect(ocr.readLeaveDocument).not.toHaveBeenCalled();
  });

  it('ไม่อ่านไฟล์ปลอมและไม่กลืนข้อผิดพลาด OCR ในขั้นร่าง', async () => {
    const { service, ocr } = setup();
    await expect(
      service.preview(student, SESSION_ID, {
        ...evidence,
        buffer: Buffer.from('fake'),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_EVIDENCE' });
    ocr.readLeaveDocument.mockRejectedValue(new Error('OCR unavailable'));
    await expect(
      service.preview(student, SESSION_ID, evidence),
    ).rejects.toThrow('OCR unavailable');
  });

  it('คืนเฉพาะคาบที่นักศึกษามีสิทธิ์ยื่นลา', async () => {
    const { service, repo } = setup();

    await expect(service.listSessions(student)).resolves.toEqual([session]);
    expect(repo.listEligibleSessions).toHaveBeenCalledWith('student-user');
  });

  it('ไม่เรียก OCR เมื่อ session ไม่ใช่วิชาที่ลงทะเบียน', async () => {
    const { service, repo, ocr } = setup();
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
    expect(ocr.readLeaveDocument).not.toHaveBeenCalled();
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

  it('มีคำขอที่ยังไม่ถูกปฏิเสธอยู่แล้ว ตอบ 409 โดยไม่เรียก OCR', async () => {
    const { service, repo, ocr } = setup();
    repo.hasActiveRequest.mockResolvedValue(true);

    await expect(
      service.submit(student, SESSION_ID, 'ป่วย', evidence),
    ).rejects.toMatchObject({ status: 409, code: 'LEAVE_REQUEST_DUPLICATE' });
    expect(repo.hasActiveRequest).toHaveBeenCalledWith('student-user', SESSION_ID);
    expect(ocr.readLeaveDocument).not.toHaveBeenCalled();
    expect(repo.createRequest).not.toHaveBeenCalled();
  });

  it('อ่านร่างกับยื่นลามีเพดานของตัวเอง ไม่นับรวมกัน', () => {
    const guards = (name: 'preview' | 'submit') =>
      Reflect.getMetadata('__guards__', LeaveController.prototype[name]) as unknown[];
    expect(guards('preview')).toEqual([PreviewLimitGuard]);
    expect(guards('submit')).toEqual([SubmitLimitGuard]);
  });

  it('Typhoon ล้มเหลวแล้วยังบันทึกคำขอและหลักฐานเพื่อให้อาจารย์ตรวจเอง', async () => {
    const { service, repo, ocr } = setup();
    ocr.readLeaveDocument.mockRejectedValue(new Error('typhoon unavailable'));

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
      documentDetails: documentDetailsSchema.parse({}),
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

describe('LeaveService.review หมายเหตุ', () => {
  const id = '11111111-1111-4111-8111-111111111111';

  it.each([123, { a: 1 }, ['x'], true, 'x'.repeat(1001)])(
    'หมายเหตุที่ไม่ถูกต้องได้ 400 ไม่เรียกฐาน (%s)',
    async (note) => {
      const { service, repo } = setup();
      await expect(service.review(teacher, id, 'approved', note)).rejects.toMatchObject({
        status: 400,
      });
      expect(repo.reviewRequest).not.toHaveBeenCalled();
    },
  );

  it('ตัดช่องว่าง ว่างหรือไม่ส่งเป็น null', async () => {
    const { service, repo } = setup();
    await service.review(teacher, id, 'approved', '  ok  ');
    await service.review(teacher, id, 'rejected', '   ');
    await service.review(teacher, id, 'rejected');
    expect((repo.reviewRequest.mock.calls as unknown[][]).map((c) => c[3])).toEqual(['ok', null, null]);
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

describe('extractLeaveReason', () => {
  it('ดึงเหตุผลจากเอกสารลาป่วยแบบฟอร์ม', () => {
    const text = `ข้อมูลสมมติสำหรับทดสอบระบบเท่านั้น
หลักฐานลาป่วยสมมติ
มหาวิทยาลัยประกายหมึกทดสอบ
ชื่อ นักศึกษาจำลอง ใบทดสอบ
รหัสนักศึกษา TEST0001
รายวิชา TEST101
วันที่ลา 9 พฤศจิกายน 2026
เหตุผล มีไข้และเจ็บคอ ขอพักรักษาตัว 1 วัน
ClassPing • หน้า 1 / 1`;
    expect(extractLeaveReason(text)).toBe('มีไข้และเจ็บคอ ขอพักรักษาตัว 1 วัน');
  });

  it('ดึงเหตุผลจากเอกสารลากิจแบบฟอร์ม', () => {
    const text = `ข้อมูลสมมติสำหรับทดสอบระบบเท่านั้น
หลักฐานลากิจสมมติ
มหาวิทยาลัยประกายหมึกทดสอบ
ชื่อ นักศึกษาจำลอง ใบทดสอบ
รหัสนักศึกษา TEST0001
รายวิชา TEST102
วันที่ลา 11–13 พฤศจิกายน 2026
เหตุผล ต้องดูแลสมาชิกในครอบครัวต่างจังหวัด
ClassPing • หน้า 1 / 1`;
    expect(extractLeaveReason(text)).toBe('ต้องดูแลสมาชิกในครอบครัวต่างจังหวัด');
  });

  it('ดึงการวินิจฉัยจากใบรับรองแพทย์', () => {
    const text = `โรงพยาบาลกรุงเทพ
ใบรับรองแพทย์
ตรวจร่างกาย นายสมชาย ใจดี
การวินิจฉัยโรค: อาหารเป็นพิษเฉียบพลัน (Acute Gastroenteritis)
เห็นควรให้พักรักษาตัว 2 วัน`;
    expect(extractLeaveReason(text)).toBe('อาหารเป็นพิษเฉียบพลัน (Acute Gastroenteritis)');
  });
});
