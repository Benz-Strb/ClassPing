import { Inject, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ADMIN } from '../supabase/supabase.module.js';
import { AppError } from '../common/app-error.js';
import { dbError } from '../common/db-error.js';
import type {
  CurriculumDocument,
  MappingInput,
  NewTransferRequest,
  ReviewDecision,
  TransferFile,
  TransferMapping,
  TransferRequest,
} from './transfers.types.js';

export const TRANSFERS_REPO = Symbol('TRANSFERS_REPO');
export const TRANSFER_BUCKET = 'transfer-documents';
export interface TransfersRepo {
  catalogCurriculum(id: string): Promise<boolean>;
  listCurricula(): Promise<CurriculumDocument[]>;
  getCurriculumDocument(id: string): Promise<CurriculumDocument | null>;
  addCurriculumDocument(
    curriculumId: string,
    path: string,
    file: TransferFile,
  ): Promise<{ id: string }>;
  listMappings(curriculumId?: string): Promise<TransferMapping[]>;
  saveMapping(input: MappingInput): Promise<TransferMapping>;
  setMappingActive(id: string, active: boolean): Promise<{ id: string }>;
  listRequests(studentId?: string): Promise<TransferRequest[]>;
  getRequest(id: string): Promise<TransferRequest | null>;
  insertRequest(input: NewTransferRequest): Promise<TransferRequest>;
  upload(path: string, file: TransferFile): Promise<void>;
  remove(path: string): Promise<void>;
  sign(path: string): Promise<string>;
  review(
    id: string,
    reviewer: string,
    decisions: ReviewDecision[],
  ): Promise<void>;
}
type Row = Record<string, any>;
function request(row: Row): TransferRequest {
  return {
    id: row.id,
    studentId: row.student_id,
    studentName: row.users?.full_name ?? null,
    studentCode: row.users?.student_id ?? null,
    curriculumId: row.curriculum_id,
    curriculumDocumentId: row.curriculum_document_id,
    curriculumName: row.curriculum_name,
    sourceInstitution: row.source_institution,
    documentPath: row.document_path,
    documentName: row.document_name,
    status: row.status,
    items: row.items,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by,
  };
}
function mapping(row: Row): TransferMapping {
  return {
    id: row.id,
    curriculumId: row.curriculum_id,
    sourceInstitution: row.source_institution,
    sourceCode: row.source_code,
    sourceName: row.source_name,
    minCredits: row.min_credits,
    targetCode: row.target_code,
    targetName: row.target_name,
    targetCredits: row.target_credits,
    active: row.active,
  };
}
function document(row: Row): CurriculumDocument {
  return {
    id: row.id,
    curriculumId: row.curriculum_id,
    curriculumName: row.admin_catalog.name,
    year: row.admin_catalog.year,
    active: row.admin_catalog.active && row.admin_catalog.kind === 'curricula',
    path: row.path,
    fileName: row.file_name,
    createdAt: row.created_at,
  };
}
async function all(query: {
  range: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: unknown[] | null; error: unknown }>;
}): Promise<Row[]> {
  const rows: Row[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await query.range(offset, offset + 499);
    if (error) throw dbError();
    rows.push(...((data as Row[]) ?? []));
    if (!data || data.length < 500) return rows;
  }
}
const REQUEST_COLUMNS = '*, users!student_id(full_name,student_id)';
@Injectable()
export class SupabaseTransfersRepo implements TransfersRepo {
  constructor(@Inject(SUPABASE_ADMIN) private readonly db: SupabaseClient) {}
  async catalogCurriculum(id: string) {
    const { data, error } = await this.db
      .from('admin_catalog')
      .select('id')
      .eq('id', id)
      .eq('kind', 'curricula')
      .eq('active', true)
      .maybeSingle();
    if (error) throw dbError();
    return !!data;
  }
  async listCurricula() {
    const rows = await all(
      this.db
        .from('transfer_curriculum_documents')
        .select('*,admin_catalog!inner(name,year,active,kind)')
        .eq('admin_catalog.kind', 'curricula')
        .eq('admin_catalog.active', true)
        .order('created_at', { ascending: false })
        .order('id'),
    );
    const seen = new Set<string>();
    return rows
      .filter((row) => {
        if (seen.has(row.curriculum_id)) return false;
        seen.add(row.curriculum_id);
        return true;
      })
      .map(document);
  }
  async getCurriculumDocument(id: string) {
    const { data, error } = await this.db
      .from('transfer_curriculum_documents')
      .select('*,admin_catalog!inner(name,year,active,kind)')
      .eq('id', id)
      .maybeSingle();
    if (error) throw dbError();
    return data ? document(data) : null;
  }
  async addCurriculumDocument(
    curriculumId: string,
    path: string,
    file: TransferFile,
  ) {
    const { data, error } = await this.db
      .from('transfer_curriculum_documents')
      .insert({
        curriculum_id: curriculumId,
        path,
        file_name: file.originalname.replace(/^.*[\\/]/u, '').slice(0, 255),
        mime: file.mimetype,
        size: file.size,
      })
      .select('id')
      .single();
    if (error) throw dbError();
    return data as { id: string };
  }
  async listMappings(curriculumId?: string) {
    let query = this.db
      .from('transfer_mappings')
      .select('*')
      .order('source_institution')
      .order('source_code')
      .order('id');
    if (curriculumId)
      query = query.eq('curriculum_id', curriculumId).eq('active', true);
    return (await all(query)).map(mapping);
  }
  async saveMapping(input: MappingInput) {
    const { data, error } = await this.db
      .from('transfer_mappings')
      .upsert(
        {
          curriculum_id: input.curriculumId,
          source_institution: input.sourceInstitution,
          source_code: input.sourceCode,
          source_name: input.sourceName,
          min_credits: input.minCredits,
          target_code: input.targetCode,
          target_name: input.targetName,
          target_credits: input.targetCredits,
          active: input.active,
        },
        { onConflict: 'curriculum_id,source_institution,source_code' },
      )
      .select('*')
      .single();
    if (error) throw dbError();
    return mapping(data);
  }
  async setMappingActive(id: string, active: boolean) {
    const { data, error } = await this.db
      .from('transfer_mappings')
      .update({ active })
      .eq('id', id)
      .select('id')
      .maybeSingle();
    if (error) throw dbError();
    if (!data) throw new AppError(404, 'MAPPING_NOT_FOUND', 'ไม่พบชุดจับคู่');
    return data as { id: string };
  }
  async listRequests(studentId?: string) {
    let query = this.db
      .from('transfer_requests')
      .select(REQUEST_COLUMNS)
      .order('created_at', { ascending: false })
      .order('id');
    if (studentId) query = query.eq('student_id', studentId);
    return (await all(query)).map(request);
  }
  async getRequest(id: string) {
    const { data, error } = await this.db
      .from('transfer_requests')
      .select(REQUEST_COLUMNS)
      .eq('id', id)
      .maybeSingle();
    if (error) throw dbError();
    return data ? request(data) : null;
  }
  async insertRequest(input: NewTransferRequest) {
    const { data, error } = await this.db
      .from('transfer_requests')
      .insert({
        student_id: input.studentId,
        curriculum_id: input.curriculumId,
        curriculum_document_id: input.curriculumDocumentId,
        curriculum_name: input.curriculumName,
        source_institution: input.sourceInstitution,
        document_path: input.documentPath,
        document_name: input.documentName,
        document_mime: input.documentMime,
        document_size: input.documentSize,
        items: input.items,
      })
      .select(REQUEST_COLUMNS)
      .single();
    if (error) throw dbError();
    return request(data);
  }
  async upload(path: string, file: TransferFile) {
    const { error } = await this.db.storage
      .from(TRANSFER_BUCKET)
      .upload(path, file.buffer, { contentType: file.mimetype, upsert: false });
    if (error) throw dbError();
  }
  async remove(path: string) {
    // A failed response can follow a committed INSERT; preserve referenced files.
    for (const [table, column] of [
      ['transfer_requests', 'document_path'],
      ['transfer_curriculum_documents', 'path'],
    ]) {
      const { data, error } = await this.db
        .from(table)
        .select('id')
        .eq(column, path)
        .limit(1)
        .maybeSingle();
      if (error) throw dbError();
      if (data) return;
    }
    const { error } = await this.db.storage
      .from(TRANSFER_BUCKET)
      .remove([path]);
    if (error) throw dbError();
  }
  async sign(path: string) {
    const { data, error } = await this.db.storage
      .from(TRANSFER_BUCKET)
      .createSignedUrl(path, 300);
    if (error || !data?.signedUrl) throw dbError();
    return data.signedUrl;
  }
  async review(id: string, reviewer: string, decisions: ReviewDecision[]) {
    const { error } = await this.db.rpc('review_transfer_request', {
      p_request_id: id,
      p_reviewer_id: reviewer,
      p_decisions: decisions,
    });
    if (!error) return;
    if (error.code === '23505')
      throw new AppError(
        409,
        'TRANSFER_ALREADY_GRANTED',
        'มีผลอนุมัติวิชาเป้าหมายนี้แล้ว ไม่สามารถให้หน่วยกิตซ้ำ',
      );
    if (error.message.includes('ALREADY_REVIEWED'))
      throw new AppError(409, 'ALREADY_REVIEWED', 'คำขอนี้พิจารณาแล้ว');
    if (error.message.includes('INVALID_REVIEW'))
      throw new AppError(
        400,
        'INVALID_REVIEW',
        'ข้อมูลผลพิจารณาไม่ครบหรือไม่ถูกต้อง',
      );
    if (error.message.includes('FORBIDDEN'))
      throw new AppError(403, 'FORBIDDEN', 'เฉพาะแอดมินเท่านั้น');
    throw dbError();
  }
}
