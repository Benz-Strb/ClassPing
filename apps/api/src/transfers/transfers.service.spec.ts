import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppUser } from '../users/users.service.js';
import { TransfersService } from './transfers.service.js';
import type { TransfersRepo } from './transfers.repo.js';

const ID = '11111111-1111-4111-8111-111111111111';
const DOC = '22222222-2222-4222-8222-222222222222';
const ITEM = '33333333-3333-4333-8333-333333333333';
const student = {
  id: 'student-1',
  role: 'student',
  studentId: '66000001',
} as AppUser;
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
    service = new TransfersService(repo as unknown as TransfersRepo);
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
  it('ไม่ให้ teacher เข้าถึงคำขอ แม้ id ตรงกับเจ้าของ', async () => {
    await expect(
      service.documentUrl({ ...student, role: 'teacher' }, ID, 'request'),
    ).rejects.toMatchObject({ status: 403 });
  });
  it('ตัดสินครบทุกวิชา และส่ง reviewer จากผู้เข้าสู่ระบบ', async () => {
    await service.review(admin, ID, {
      decisions: [
        { itemId: ITEM, decision: 'approved', note: 'ตรวจเอกสารแล้ว' },
      ],
    });
    expect(repo.review).toHaveBeenCalledWith(ID, admin.id, [
      { itemId: ITEM, decision: 'approved', note: 'ตรวจเอกสารแล้ว' },
    ]);
  });
  it('ห้ามอนุมัติวิชาที่ยังจับคู่ไม่ได้', async () => {
    repo.getRequest.mockResolvedValue({
      ...pending,
      items: [{ ...pending.items[0], match: null }],
    });
    await expect(
      service.review(admin, ID, {
        decisions: [{ itemId: ITEM, decision: 'approved', note: '' }],
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(repo.review).not.toHaveBeenCalled();
  });
  it('ห้ามตัดสินซ้ำหรือส่งผลไม่ครบ', async () => {
    await expect(
      service.review(admin, ID, { decisions: [] }),
    ).rejects.toMatchObject({ status: 400 });
    repo.getRequest.mockResolvedValue({ ...pending, status: 'approved' });
    await expect(
      service.review(admin, ID, {
        decisions: [{ itemId: ITEM, decision: 'approved', note: '' }],
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('การปฏิเสธต้องมีเหตุผล', async () => {
    await expect(
      service.review(admin, ID, {
        decisions: [{ itemId: ITEM, decision: 'rejected', note: '' }],
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
