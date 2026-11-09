import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppUser } from '../users/users.service.js';
import { TransfersService } from './transfers.service.js';
import type { LeaveOcrClient } from '../leave/leave-ocr.client.js';
import type { TransfersRepo } from './transfers.repo.js';

const ID = '11111111-1111-4111-8111-111111111111';
const DOC = '22222222-2222-4222-8222-222222222222';
const ITEM = '33333333-3333-4333-8333-333333333333';
const student = {
  id: 'student-1',
  role: 'student',
  studentId: '66000001',
} as AppUser;
const teacher = { id: 'teacher-1', role: 'teacher' } as AppUser;
const admin = { id: 'admin-1', role: 'admin' } as AppUser;
const file = {
  buffer: Buffer.from('%PDF-1.7\n%%EOF'),
  mimetype: 'application/pdf',
  originalname: 'transcript.pdf',
  size: 14,
};
const input = {
  curriculumDocumentId: DOC,
  sourceInstitution: 'School A',
  courses: [
    {
      sourceCode: ' cs101 ',
      sourceName: 'Programming',
      credits: 3,
      grade: 'B',
    },
  ],
};
const mapping = {
  id: ID,
  curriculumId: ID,
  sourceInstitution: 'SCHOOL A',
  sourceCode: 'CS101',
  sourceName: 'Programming',
  minCredits: 3,
  targetCode: 'IT101',
  targetName: 'เขียนโปรแกรม',
  targetCredits: 3,
  active: true,
};
const pending = {
  id: ID,
  studentId: student.id,
  curriculumId: ID,
  curriculumDocumentId: DOC,
  curriculumName: 'หลักสูตร',
  status: 'pending',
  documentPath: 'private/file.pdf',
  documentName: 'file.pdf',
  items: [
    {
      id: ITEM,
      sourceCode: 'CS101',
      sourceName: 'Programming',
      credits: 3,
      grade: 'B',
      match: mapping,
    },
  ],
  sourceInstitution: 'SCHOOL A',
};

describe('TransfersService', () => {
  let service: TransfersService;
  let repo: Record<string, ReturnType<typeof vi.fn>>;
  beforeEach(() => {
    repo = Object.fromEntries(
      [
        'getCurriculumDocument',
        'listCurricula',
        'listMappings',
        'insertRequest',
        'upload',
        'remove',
        'getRequest',
        'review',
        'sign',
        'catalogCurriculum',
        'addCurriculumDocument',
        'listRequests',
        'setMappingActive',
      ].map((name) => [name, vi.fn()]),
    );
    repo.getCurriculumDocument.mockResolvedValue({
      id: DOC,
      curriculumId: ID,
      curriculumName: 'หลักสูตร 2569',
      active: true,
      path: 'curriculum.pdf',
    });
    repo.listMappings.mockResolvedValue([mapping]);
    repo.insertRequest.mockResolvedValue(pending);
    repo.getRequest.mockResolvedValue(pending);
    repo.listRequests.mockResolvedValue([pending]);
    service = new TransfersService(repo as unknown as TransfersRepo, { readTransferDocument: vi.fn() } as unknown as LeaveOcrClient);
  });
  it('จับคู่จากข้อมูล server เท่านั้น และเก็บเอกสารก่อนสร้างคำขอ', async () => {
    const result = await service.submit(
      student,
      { ...input, studentId: 'other', status: 'approved' },
      file,
    );
    const saved = repo.insertRequest.mock.calls[0][0];
    expect(saved.studentId).toBe(student.id);
    expect(saved.items[0].match.targetCode).toBe('IT101');
    expect(saved.items[0].sourceCode).toBe('CS101');
    expect(result).not.toHaveProperty('documentPath');
    expect(repo.upload).toHaveBeenCalledOnce();
  });
  it('ให้นักศึกษาเลือกชื่อสถาบันที่มีคู่เทียบโดยไม่เปิดเผย path เอกสาร', async () => {
    repo.listCurricula.mockResolvedValue([
      { id: DOC, curriculumId: ID, path: 'private/curriculum.pdf' },
    ]);
    const docs = await service.curricula(student);
    expect(docs[0].sourceInstitutions).toEqual(['SCHOOL A']);
    expect(docs[0]).not.toHaveProperty('path');
  });
  it('หน่วยกิตไม่ถึงเกณฑ์ต้องไม่จับคู่', async () => {
    await service.submit(
      student,
      { ...input, courses: [{ ...input.courses[0], credits: 2 }] },
      file,
    );
    expect(repo.insertRequest.mock.calls[0][0].items[0].match).toBeNull();
  });
  it('ชดเชยลบไฟล์ถ้าสร้างคำขอล้มเหลว', async () => {
    repo.insertRequest.mockRejectedValue(new Error('db failure'));
    await expect(service.submit(student, input, file)).rejects.toThrow(
      'db failure',
    );
    expect(repo.remove).toHaveBeenCalledWith(repo.upload.mock.calls[0][0]);
  });
  it.each([
    { ...file, buffer: Buffer.from('fake pdf') },
    { ...file, size: 11 * 1024 * 1024 },
    undefined,
  ])('ปฏิเสธไฟล์ไม่ถูกต้องก่อนอัปโหลด', async (evidence) => {
    await expect(
      service.submit(student, input, evidence),
    ).rejects.toMatchObject({ status: expect.any(Number) });
    expect(repo.upload).not.toHaveBeenCalled();
  });
  it('ไม่ให้รายวิชาเดิมซ้ำในคำขอ', async () => {
    await expect(
      service.submit(
        student,
        { ...input, courses: [input.courses[0], input.courses[0]] },
        file,
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
  it('ไม่เซ็นเอกสารของคนอื่น', async () => {
    await expect(
      service.documentUrl({ ...student, id: 'other' }, ID, 'request'),
    ).rejects.toMatchObject({ status: 404 });
    expect(repo.sign).not.toHaveBeenCalled();
  });
  it('ไม่ให้ admin เข้าถึงคำขอ แม้ id ตรงกับเจ้าของ', async () => {
    await expect(
      service.documentUrl({ ...student, role: 'admin' }, ID, 'request'),
    ).rejects.toMatchObject({ status: 403 });
  });
  it('ไม่ส่งคำขอเก่าของนักศึกษาคนอื่นที่ใช้เติมคำแนะนำให้นักศึกษา แต่อาจารย์เห็น', async () => {
    const previousApproval = { requestId: DOC, reviewedAt: '2026-11-01T00:00:00.000Z' };
    const withHistory = { ...pending, items: [{ ...pending.items[0], matchSource: 'history', previousApproval }] };
    repo.listRequests.mockResolvedValue([withHistory]);
    repo.insertRequest.mockResolvedValue(withHistory);
    const [mine] = await service.list(student);
    expect(mine.items[0]).not.toHaveProperty('previousApproval');
    expect(mine).not.toHaveProperty('documentPath');
    const created = await service.submit(student, input, file);
    expect(created.items[0]).not.toHaveProperty('previousApproval');
    const [forTeacher] = await service.list(teacher);
    expect(forTeacher.items[0]).toMatchObject({ previousApproval });
  });
  it('อาจารย์เห็นคำขอทุกคนและเปิดหลักฐานได้ นักศึกษาเห็นเฉพาะของตัวเอง', async () => {
    await service.list(teacher);
    expect(repo.listRequests).toHaveBeenLastCalledWith(undefined);
    await service.list(student);
    expect(repo.listRequests).toHaveBeenLastCalledWith(student.id);
    repo.sign.mockResolvedValue('signed');
    await expect(
      service.documentUrl(teacher, ID, 'request'),
    ).resolves.toEqual({ url: 'signed' });
  });
  it('อาจารย์ดูเอกสารหลักสูตรที่ปิดแล้วได้ นักศึกษาดูไม่ได้', async () => {
    repo.getCurriculumDocument.mockResolvedValue({
      id: DOC,
      curriculumId: ID,
      active: false,
      path: 'curriculum.pdf',
    });
    repo.sign.mockResolvedValue('signed');
    await expect(
      service.curriculumDocumentUrl(teacher, DOC),
    ).resolves.toEqual({ url: 'signed' });
    await expect(
      service.curriculumDocumentUrl(student, DOC),
    ).rejects.toMatchObject({ status: 404 });
  });
  it.each([
    ['curricula', (u: AppUser) => service.curricula(u)],
    ['mappings', (u: AppUser) => service.mappings(u)],
    ['list', (u: AppUser) => service.list(u)],
    ['saveMapping', (u: AppUser) => service.saveMapping(u, {})],
    ['setMappingActive', (u: AppUser) => service.setMappingActive(u, ID, { active: false })],
    ['uploadCurriculum', (u: AppUser) => service.uploadCurriculum(u, ID, file)],
    ['curriculumDocumentUrl', (u: AppUser) => service.curriculumDocumentUrl(u, DOC)],
    ['review', (u: AppUser) => service.review(u, ID, { decisions: [] })],
  ])('admin ใช้ %s ไม่ได้', async (_name, call) => {
    await expect(call(admin)).rejects.toMatchObject({ status: 403 });
    expect(repo.upload).not.toHaveBeenCalled();
    expect(repo.review).not.toHaveBeenCalled();
  });
  it.each([
    ['saveMapping', (u: AppUser) => service.saveMapping(u, {})],
    ['uploadCurriculum', (u: AppUser) => service.uploadCurriculum(u, ID, file)],
    ['review', (u: AppUser) => service.review(u, ID, { decisions: [] })],
  ])('นักศึกษาใช้ %s ไม่ได้', async (_name, call) => {
    await expect(call(student)).rejects.toMatchObject({ status: 403 });
  });
  it('อาจารย์ยื่นคำขอแทนไม่ได้', async () => {
    await expect(
      service.submit({ ...teacher, studentId: '66000001' } as AppUser, input, file),
    ).rejects.toMatchObject({ status: 403 });
  });
  it('ตัดสินครบทุกวิชา และส่ง reviewer จากผู้เข้าสู่ระบบ', async () => {
    await service.review(teacher, ID, {
      decisions: [
        { itemId: ITEM, decision: 'approved', note: 'ตรวจเอกสารแล้ว' },
      ],
    });
    expect(repo.review).toHaveBeenCalledWith(ID, teacher.id, [
      { itemId: ITEM, decision: 'approved', note: 'ตรวจเอกสารแล้ว' },
    ], DOC);
  });
  it('ห้ามอนุมัติวิชาที่ยังจับคู่ไม่ได้', async () => {
    repo.getRequest.mockResolvedValue({
      ...pending,
      items: [{ ...pending.items[0], match: null }],
    });
    await expect(
      service.review(teacher, ID, {
        decisions: [{ itemId: ITEM, decision: 'approved', note: '' }],
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(repo.review).not.toHaveBeenCalled();
  });
  it('ห้ามตัดสินซ้ำหรือส่งผลไม่ครบ', async () => {
    await expect(
      service.review(teacher, ID, { decisions: [] }),
    ).rejects.toMatchObject({ status: 400 });
    repo.getRequest.mockResolvedValue({ ...pending, status: 'approved' });
    await expect(
      service.review(teacher, ID, {
        decisions: [{ itemId: ITEM, decision: 'approved', note: '' }],
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('การปฏิเสธต้องมีเหตุผล', async () => {
    await expect(
      service.review(teacher, ID, {
        decisions: [{ itemId: ITEM, decision: 'rejected', note: '' }],
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
  it('นักศึกษาส่งเอกสารได้แม้ยังไม่มีหลักสูตรปลายทาง', async () => {
    repo.listCurricula.mockResolvedValue([]);
    repo.listMappings.mockResolvedValue([]);
    await service.submit(student, { ...input, curriculumDocumentId: null, sourceMajor: 'CS' }, file);
    expect(repo.insertRequest.mock.calls[0][0]).toMatchObject({ curriculumId: null, curriculumDocumentId: null, sourceMajor: 'CS', items: [{ match: null }] });
  });
  it('อาจารย์เลือกคู่เทียบจากหลักสูตรได้แต่ห้ามส่งวิชาที่ไม่มีในหลักสูตร', async () => {
    repo.getCurriculumDocument.mockResolvedValue({ id: DOC, curriculumId: ID, active: true, courses: [{ sourceCode: 'IT102', sourceName: 'Programming II', credits: 3, grade: '' }] });
    await service.review({ ...admin, role: 'teacher' }, ID, { decisions: [{ itemId: ITEM, decision: 'approved', targetCode: 'IT102' }] });
    expect(repo.review.mock.calls[0][2][0].match.targetCode).toBe('IT102');
    await expect(service.review({ ...admin, role: 'teacher' }, ID, { decisions: [{ itemId: ITEM, decision: 'approved', targetCode: 'INVENTED' }] })).rejects.toMatchObject({ status: 400 });
  });
  it('นักศึกษาไม่มีสิทธิ์พิจารณาคำขอ', async () => {
    await expect(service.review(student, ID, { decisions: [{ itemId: ITEM, decision: 'approved' }] })).rejects.toMatchObject({ status: 403 });
    expect(repo.review).not.toHaveBeenCalled();
  });

  it('requires a teacher recheck before finalizing automatically suggested approvals', async () => {
    repo.getRequest.mockResolvedValue({ ...pending, items: pending.items.map(item => ({ ...item, autoApprovalSuggested: true })) });
    await expect(service.review(teacher, ID, { decisions: [{ itemId: ITEM, decision: 'approved' }] })).rejects.toMatchObject({ code: 'RECHECK_REQUIRED' });
    expect(repo.review).not.toHaveBeenCalled();
    await service.review(teacher, ID, { confirmedRecommendations: true, decisions: [{ itemId: ITEM, decision: 'approved' }] });
    expect(repo.review).toHaveBeenCalledOnce();
  });

  it('keeps history-based automatic suggestions pending until a teacher confirms', async () => {
    repo.getCurriculumDocument.mockResolvedValue({ id: DOC, curriculumId: ID, active: true, courses: [{ sourceCode: mapping.targetCode, sourceName: mapping.targetName, credits: mapping.targetCredits, grade: '' }] });
    repo.listRequests.mockResolvedValue([{ ...pending, sourceMajor: 'CS', curriculumId: ID, reviewedAt: '2026-11-08', status: 'approved', items: pending.items.map(item => ({ ...item, decision: 'approved' })) }]);
    await service.submit(student, { ...input, sourceMajor: 'CS' }, file);
    expect(repo.insertRequest.mock.calls[0][0].items[0].autoApprovalSuggested).toBe(true);
    expect(repo.review).not.toHaveBeenCalled();
    expect(repo.insertRequest.mock.calls[0][0]).not.toHaveProperty('status', 'approved');
  });

  it('persists reviewed study-year assignments in curriculum document courses', async () => {
    repo.catalogCurriculum.mockResolvedValue(true);
    repo.addCurriculumDocument.mockResolvedValue({ id: DOC });
    const draft = { sourceInstitution: 'DPU', sourceMajor: 'CS', courses: [{ sourceCode: 'IT101', sourceName: 'Programming', credits: 3, grade: '', studyYear: 2 }], ocrText: '' };
    await service.uploadCurriculum(teacher, ID, file, draft);
    expect(repo.addCurriculumDocument.mock.calls[0][3].courses[0].studyYear).toBe(2);
    await expect(service.uploadCurriculum(teacher, ID, file, { ...draft, courses: [{ ...draft.courses[0], studyYear: 5 }] })).rejects.toMatchObject({ status: 400 });
  });

});
