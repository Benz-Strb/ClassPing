import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AppError } from '../common/app-error.js';
import { looksLike } from '../common/image-type.js';
import { parseBody } from '../common/validate.js';
import type { AppUser } from '../users/users.service.js';
import { TRANSFERS_REPO, type TransfersRepo } from './transfers.repo.js';
import {
  mappingSchema,
  reviewSchema,
  submitSchema,
  type TransferFile,
  type TransferRequest,
} from './transfers.types.js';

const extensions: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};
const missing = () =>
  new AppError(404, 'TRANSFER_NOT_FOUND', 'ไม่พบข้อมูลเทียบโอนนี้');
const view = ({ documentPath: _path, ...request }: TransferRequest) => request;
const id = (value: string) => parseBody(z.uuid(), value);
function allow(user: AppUser, roles: string[]) {
  if (!roles.includes(user.role))
    throw new AppError(403, 'FORBIDDEN', 'ไม่มีสิทธิ์ใช้งานส่วนนี้');
}
function validateFile(file?: TransferFile): asserts file is TransferFile {
  if (!file) throw new AppError(400, 'DOCUMENT_REQUIRED', 'กรุณาแนบเอกสาร');
  if (
    file.size <= 0 ||
    file.size > 10 * 1024 * 1024 ||
    file.buffer.length !== file.size
  )
    throw new AppError(413, 'DOCUMENT_SIZE', 'ไฟล์ต้องมีขนาดไม่เกิน 10 MB');
  if (
    !extensions[file.mimetype] ||
    !(file.mimetype === 'application/pdf'
      ? file.buffer.subarray(0, 5).toString() === '%PDF-'
      : looksLike(file.mimetype, file.buffer))
  )
    throw new AppError(
      400,
      'DOCUMENT_TYPE',
      'รองรับเฉพาะ PDF, JPG หรือ PNG ที่มีชนิดไฟล์ถูกต้อง',
    );
}
function body(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    throw new AppError(400, 'BAD_REQUEST', 'ข้อมูลคำขอไม่ถูกต้อง');
  }
}

@Injectable()
export class TransfersService {
  private readonly logger = new Logger(TransfersService.name);
  constructor(@Inject(TRANSFERS_REPO) private readonly repo: TransfersRepo) {}

  async curricula(user: AppUser) {
    allow(user, ['student', 'admin']);
    const [docs, mappings] = await Promise.all([
      this.repo.listCurricula(),
      this.repo.listMappings(),
    ]);
    return docs.map(({ path: _path, ...doc }) => ({
      ...doc,
      sourceInstitutions: [
        ...new Set(
          mappings
            .filter((m) => m.active && m.curriculumId === doc.curriculumId)
            .map((m) => m.sourceInstitution),
        ),
      ].sort(),
    }));
  }
  async mappings(user: AppUser) {
    allow(user, ['admin']);
    return this.repo.listMappings();
  }
  async curriculumDocumentUrl(user: AppUser, documentId: string) {
    allow(user, ['student', 'admin']);
    const doc = await this.repo.getCurriculumDocument(id(documentId));
    if (!doc || (user.role === 'student' && !doc.active)) throw missing();
    return { url: await this.repo.sign(doc.path) };
  }
  async saveMapping(user: AppUser, value: unknown) {
    allow(user, ['admin']);
    const input = parseBody(mappingSchema, value);
    if (!(await this.repo.catalogCurriculum(input.curriculumId)))
      throw missing();
    return this.repo.saveMapping(input);
  }
  async setMappingActive(user: AppUser, mappingId: string, value: unknown) {
    allow(user, ['admin']);
    const { active } = parseBody(z.object({ active: z.boolean() }), value);
    return this.repo.setMappingActive(id(mappingId), active);
  }
  async uploadCurriculum(
    user: AppUser,
    curriculumId: string,
    file?: TransferFile,
  ) {
    allow(user, ['admin']);
    id(curriculumId);
    validateFile(file);
    if (!(await this.repo.catalogCurriculum(curriculumId))) throw missing();
    const path = `curricula/${curriculumId}/${randomUUID()}.${extensions[file.mimetype]}`;
    await this.repo.upload(path, file);
    try {
      return await this.repo.addCurriculumDocument(curriculumId, path, file);
    } catch (error) {
      await this.cleanup(path);
      throw error;
    }
  }
  async list(user: AppUser) {
    allow(user, ['student', 'admin']);
    return (
      await this.repo.listRequests(
        user.role === 'student' ? user.id : undefined,
      )
    ).map(view);
  }
  async submit(user: AppUser, value: unknown, file?: TransferFile) {
    allow(user, ['student']);
    if (!user.studentId)
      throw new AppError(
        403,
        'STUDENT_ONLY',
        'ต้องมีรหัสนักศึกษาเพื่อยื่นเทียบโอน',
      );
    const input = parseBody(submitSchema, body(value));
    validateFile(file);
    const doc = await this.repo.getCurriculumDocument(
      input.curriculumDocumentId,
    );
    if (!doc?.active) throw missing();
    const mappings = await this.repo.listMappings(doc.curriculumId);
    const items = input.courses.map((course) => ({
      ...course,
      id: randomUUID(),
      match:
        mappings.find(
          (m) =>
            m.active &&
            m.curriculumId === doc.curriculumId &&
            m.sourceInstitution === input.sourceInstitution &&
            m.sourceCode === course.sourceCode &&
            course.credits >= m.minCredits,
        ) ?? null,
    }));
    const targets = items.flatMap((item) =>
      item.match ? [item.match.targetCode] : [],
    );
    if (new Set(targets).size !== targets.length)
      throw new AppError(
        400,
        'DUPLICATE_TARGET',
        'รายวิชาเดิมหลายวิชาจับคู่กับวิชาเป้าหมายเดียวกัน กรุณาแยกตรวจ',
      );
    const path = `requests/${user.id}/${randomUUID()}.${extensions[file.mimetype]}`;
    await this.repo.upload(path, file);
    try {
      return view(
        await this.repo.insertRequest({
          studentId: user.id,
          curriculumId: doc.curriculumId,
          curriculumDocumentId: doc.id,
          curriculumName: doc.curriculumName,
          sourceInstitution: input.sourceInstitution,
          documentPath: path,
          documentName: file.originalname
            .replace(/^.*[\\/]/u, '')
            .slice(0, 255),
          documentMime: file.mimetype,
          documentSize: file.size,
          items,
        }),
      );
    } catch (error) {
      await this.cleanup(path);
      throw error;
    }
  }
  async documentUrl(user: AppUser, requestId: string, kind: string) {
    allow(user, ['student', 'admin']);
    parseBody(z.enum(['request', 'curriculum']), kind);
    const request = await this.repo.getRequest(id(requestId));
    if (!request || (user.role === 'student' && request.studentId !== user.id))
      throw missing();
    const path =
      kind === 'request'
        ? request.documentPath
        : (await this.repo.getCurriculumDocument(request.curriculumDocumentId))
            ?.path;
    if (!path) throw missing();
    return { url: await this.repo.sign(path) };
  }
  async review(user: AppUser, requestId: string, value: unknown) {
    allow(user, ['admin']);
    const input = parseBody(reviewSchema, value);
    const request = await this.repo.getRequest(id(requestId));
    if (!request) throw missing();
    if (request.status !== 'pending')
      throw new AppError(409, 'ALREADY_REVIEWED', 'คำขอนี้พิจารณาแล้ว');
    if (
      input.decisions.length !== request.items.length ||
      new Set(input.decisions.map((d) => d.itemId)).size !==
        request.items.length
    )
      throw new AppError(
        400,
        'INCOMPLETE_REVIEW',
        'ต้องพิจารณารายวิชาให้ครบและไม่ซ้ำ',
      );
    for (const decision of input.decisions) {
      const item = request.items.find((i) => i.id === decision.itemId);
      if (!item || (decision.decision === 'approved' && !item.match))
        throw new AppError(
          400,
          'UNMATCHED_COURSE',
          'อนุมัติได้เฉพาะรายวิชาที่มีคู่เทียบตามเกณฑ์',
        );
    }
    await this.repo.review(request.id, user.id, input.decisions);
    return { id: request.id };
  }
  private async cleanup(path: string) {
    try {
      await this.repo.remove(path);
    } catch {
      this.logger.error(
        'ลบไฟล์เทียบโอนหลังบันทึกล้มเหลวไม่สำเร็จ ต้องตรวจไฟล์กำพร้าใน private bucket',
      );
    }
  }
}
