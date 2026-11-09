import { LeaveOcrClient } from '../leave/leave-ocr.client.js';
import { extractTransferDraft, normalize, suggestItems } from './transfer-ocr.js';
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
  curriculumDraftSchema,
  reviewSchema,
  submitSchema,
  type TransferFile,
  type TransferRequest,
  type CurriculumDocument,
  type StoredReviewDecision,
} from './transfers.types.js';

const extensions: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};
const missing = () =>
  new AppError(404, 'TRANSFER_NOT_FOUND', 'ไม่พบข้อมูลเทียบโอนนี้');
const view = ({ documentPath: _path, ...request }: TransferRequest) => request;
// คำขอเก่าที่ใช้เติมคำแนะนำเป็นของนักศึกษาคนอื่น ให้อาจารย์เห็นอย่างเดียว
const studentView = (request: TransferRequest) => ({
  ...view(request),
  items: request.items.map(({ previousApproval: _previous, ...item }) => item),
});
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
  constructor(@Inject(TRANSFERS_REPO) private readonly repo: TransfersRepo, private readonly ocr: LeaveOcrClient) {}

  async curricula(user: AppUser) {
    allow(user, ['student', 'teacher']);
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
    allow(user, ['teacher']);
    return this.repo.listMappings();
  }
  async curriculumDocumentUrl(user: AppUser, documentId: string) {
    allow(user, ['student', 'teacher']);
    const doc = await this.repo.getCurriculumDocument(id(documentId));
    if (!doc || (user.role === 'student' && !doc.active)) throw missing();
    return { url: await this.repo.sign(doc.path) };
  }
  async saveMapping(user: AppUser, value: unknown) {
    allow(user, ['teacher']);
    const input = parseBody(mappingSchema, value);
    if (!(await this.repo.catalogCurriculum(input.curriculumId)))
      throw missing();
    return this.repo.saveMapping(input);
  }
  async setMappingActive(user: AppUser, mappingId: string, value: unknown) {
    allow(user, ['teacher']);
    const { active } = parseBody(z.object({ active: z.boolean() }), value);
    return this.repo.setMappingActive(id(mappingId), active);
  }
  async uploadCurriculum(
    user: AppUser,
    curriculumId: string,
    file?: TransferFile,
    details?: unknown,
  ) {
    allow(user, ['teacher']);
    id(curriculumId);
    validateFile(file);
    if (!(await this.repo.catalogCurriculum(curriculumId))) throw missing();
    const path = `curricula/${curriculumId}/${randomUUID()}.${extensions[file.mimetype]}`;
    await this.repo.upload(path, file);
    try {
      const parsed = details ? parseBody(curriculumDraftSchema, body(details)) : extractTransferDraft((await this.ocr.readTransferDocument(file.buffer, file.mimetype)).lines);
      if (!parsed.courses.length) throw new AppError(400, 'NO_COURSES', 'ไม่พบรายวิชา กรุณาอ่านเอกสารและตรวจข้อมูลก่อนบันทึก');
      return await this.repo.addCurriculumDocument(curriculumId, path, file, parsed);
    } catch (error) {
      await this.cleanup(path);
      throw error;
    }
  }
  async list(user: AppUser) {
    allow(user, ['student', 'teacher']);
    return (
      await this.repo.listRequests(
        user.role === 'student' ? user.id : undefined,
      )
    ).map(user.role === 'student' ? studentView : view);
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
    let doc: CurriculumDocument | null = input.curriculumDocumentId ? await this.repo.getCurriculumDocument(input.curriculumDocumentId) : null;
    if (input.curriculumDocumentId && !doc?.active) throw missing();
    const mappings = await this.repo.listMappings(doc?.curriculumId);
    const history = await this.repo.listRequests();
    if (!doc) {
      const docs = await this.repo.listCurricula();
      const ranked = docs.map(candidate => ({ doc: candidate, score: suggestItems(input.courses, input.sourceInstitution, input.sourceMajor, candidate, mappings, history).filter(i => i.match).length })).sort((a, b) => b.score - a.score);
      if (ranked[0]?.score && (!ranked[1] || ranked[0].score > ranked[1].score)) doc = ranked[0].doc;
    }
    const items = (doc ? suggestItems(input.courses, input.sourceInstitution, input.sourceMajor, doc, mappings, history) : input.courses.map(course => ({ ...course, match: null }))).map(course => ({ ...course, id: randomUUID() }));
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
      return studentView(
        await this.repo.insertRequest({
          studentId: user.id,
          curriculumId: doc?.curriculumId ?? null,
          curriculumDocumentId: doc?.id ?? null,
          curriculumName: doc?.curriculumName ?? 'รออาจารย์เลือกหลักสูตรปลายทาง',
          sourceMajor: input.sourceMajor,
          ocrText: input.ocrText,
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
    allow(user, ['student', 'teacher']);
    parseBody(z.enum(['request', 'curriculum']), kind);
    const request = await this.repo.getRequest(id(requestId));
    if (!request || (user.role === 'student' && request.studentId !== user.id))
      throw missing();
    const path =
      kind === 'request'
        ? request.documentPath
        : (request.curriculumDocumentId ? await this.repo.getCurriculumDocument(request.curriculumDocumentId) : null)
            ?.path;
    if (!path) throw missing();
    return { url: await this.repo.sign(path) };
  }
  async review(user: AppUser, requestId: string, value: unknown) {
    allow(user, ['teacher']);
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
    const decisions: StoredReviewDecision[] = [];
    if (!input.confirmedRecommendations && input.decisions.some(decision => decision.decision === 'approved' && request.items.some(item => item.id === decision.itemId && item.autoApprovalSuggested))) {
      throw new AppError(400, 'RECHECK_REQUIRED', 'กรุณาตรวจซ้ำและยืนยันวิชาที่ระบบเสนออนุมัติจากประวัติ');
    }
    const doc = request.curriculumDocumentId ? await this.repo.getCurriculumDocument(request.curriculumDocumentId) : null;
    for (const decision of input.decisions) {
      const item = request.items.find(i => i.id === decision.itemId);
      if (!item) throw new AppError(400, 'INVALID_REVIEW', 'ไม่พบรายวิชาที่พิจารณา');
      let match = item.match;
      if (decision.targetCode !== undefined) {
        const target = doc?.courses?.find(c => normalize(c.sourceCode) === normalize(decision.targetCode!));
        if (!target || item.credits < target.credits) throw new AppError(400, 'UNMATCHED_COURSE', 'คู่เทียบไม่อยู่ในหลักสูตรหรือหน่วยกิตไม่ถึงเกณฑ์');
        match = { id: doc!.id, curriculumId: doc!.curriculumId, sourceInstitution: request.sourceInstitution, sourceCode: item.sourceCode, sourceName: item.sourceName, minCredits: target.credits, targetCode: target.sourceCode, targetName: target.sourceName, targetCredits: target.credits, active: true };
      }
      if (decision.decision === 'approved' && (!match || !doc?.active)) throw new AppError(400, 'UNMATCHED_COURSE', 'กรุณาเลือกหลักสูตรและคู่เทียบก่อนอนุมัติ');
      decisions.push(decision.targetCode ? { ...decision, match } : decision);
    }
    const targetCodes = decisions.filter(d => d.decision === 'approved').map(d => (d.match ?? request.items.find(i => i.id === d.itemId)?.match)?.targetCode);
    if (new Set(targetCodes).size !== targetCodes.length) throw new AppError(400, 'DUPLICATE_TARGET', 'ห้ามให้หน่วยกิตวิชาเป้าหมายซ้ำในคำขอเดียวกัน');
    await this.repo.review(request.id, user.id, decisions, request.curriculumDocumentId);
    return { id: request.id };
  }
  async preview(user: AppUser, file?: TransferFile) {
    allow(user, ['student', 'teacher']);
    validateFile(file);
    return extractTransferDraft((await this.ocr.readTransferDocument(file.buffer, file.mimetype)).lines);
  }
  async createCurriculum(user: AppUser, value: unknown, file?: TransferFile) {
    allow(user, ['teacher']);
    validateFile(file);
    const input = parseBody(z.object({ name: z.string().trim().min(1).max(200), year: z.number().int().min(1900).max(2700), draft: curriculumDraftSchema }), body(value));
    const curriculumId = await this.repo.createCatalog(input.name, input.year);
    return this.uploadCurriculum(user, curriculumId, file, input.draft);
  }
  async assign(user: AppUser, requestId: string, value: unknown) {
    allow(user, ['teacher']);
    const { curriculumDocumentId } = parseBody(z.object({ curriculumDocumentId: z.uuid() }), value);
    const request = await this.repo.getRequest(id(requestId));
    const doc = await this.repo.getCurriculumDocument(curriculumDocumentId);
    if (!request || !doc?.active) throw missing();
    if (request.status !== 'pending') throw new AppError(409, 'ALREADY_REVIEWED', 'คำขอนี้พิจารณาแล้ว');
    const [mappings, history] = await Promise.all([this.repo.listMappings(doc.curriculumId), this.repo.listRequests()]);
    const items = suggestItems(request.items, request.sourceInstitution, request.sourceMajor ?? '', doc, mappings, history).map((item, index) => ({ ...item, id: request.items[index].id }));
    await this.repo.assignCurriculum(request.id, doc, items);
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
