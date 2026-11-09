import { z } from 'zod';
import type { ExtractedCourse } from './transfer-ocr.js';

const text = (max: number) => z.string().trim().min(1).max(max);
export const keyText = (max: number) =>
  text(max).transform((s) => s.normalize('NFKC').toUpperCase());
const credits = z.number().min(0.5).max(30).multipleOf(0.5);
export const mappingSchema = z.object({
  curriculumId: z.uuid(),
  sourceInstitution: keyText(200),
  sourceCode: keyText(60),
  sourceName: text(200),
  minCredits: credits,
  targetCode: keyText(60),
  targetName: text(200),
  targetCredits: credits,
  active: z.boolean().default(true),
});
export type MappingInput = z.infer<typeof mappingSchema>;
export interface TransferMapping extends MappingInput {
  id: string;
}
export const courseSchema = z.object({ sourceCode: keyText(60), sourceName: text(200), credits, grade: z.string().trim().max(20).default(''), studyYear: z.number().int().min(1).max(4).nullable().optional() });
export const curriculumDraftSchema = z.object({ sourceInstitution: keyText(200), sourceMajor: text(200), courses: z.array(courseSchema).min(1).max(1000), ocrText: z.string().max(200_000).default('') }).refine(v => new Set(v.courses.map(c => c.sourceCode)).size === v.courses.length, { message: 'รหัสรายวิชาต้องไม่ซ้ำกัน' });
export const submitSchema = z
  .object({
    curriculumDocumentId: z.uuid().nullable().optional(),
    sourceMajor: z.string().trim().max(200).default(''),
    ocrText: z.string().max(200_000).default(''),
    sourceInstitution: keyText(200),
    courses: z
      .array(
        z.object({
          sourceCode: keyText(60),
          sourceName: text(200),
          credits,
          grade: z.string().trim().max(20).default(''),
        }),
      )
      .min(1)
      .max(50),
  })
  .refine(
    (v) =>
      new Set(v.courses.map((c) => c.sourceCode)).size === v.courses.length,
    { message: 'รายวิชาเดิมต้องไม่ซ้ำกัน' },
  );
export const reviewSchema = z.object({
  confirmedRecommendations: z.boolean().default(false),
  decisions: z
    .array(
      z
        .object({
          itemId: z.uuid(),
          decision: z.enum(['approved', 'rejected']),
          targetCode: z.string().trim().max(60).optional(),
          note: z.string().trim().max(2000).default(''),
        })
        .refine((v) => v.decision !== 'rejected' || v.note.length > 0, {
          message: 'การปฏิเสธต้องมีเหตุผล',
        }),
    )
    .min(1)
    .max(50),
});
export type ReviewDecision = z.infer<typeof reviewSchema>['decisions'][number];
export interface TransferItem {
  id: string;
  sourceCode: string;
  sourceName: string;
  credits: number;
  grade: string;
  match: TransferMapping | null;
  matchSource?: 'history' | 'curriculum' | 'mapping';
  autoApprovalSuggested?: boolean;
  previousApproval?: { requestId: string; reviewedAt: string };
  decision?: 'approved' | 'rejected';
  note?: string;
}
export interface CurriculumDocument {
  id: string;
  curriculumId: string;
  curriculumName: string;
  year: number;
  active: boolean;
  path: string;
  fileName: string;
  createdAt: string;
  sourceInstitution?: string;
  sourceMajor?: string;
  courses?: ExtractedCourse[];
  ocrText?: string;
}
export interface TransferRequest {
  id: string;
  studentId: string;
  studentName: string | null;
  studentCode: string | null;
  curriculumId: string | null;
  curriculumDocumentId: string | null;
  curriculumName: string;
  sourceInstitution: string;
  sourceMajor?: string;
  ocrText?: string;
  documentPath: string;
  documentName: string;
  status: 'pending' | 'approved' | 'partially_approved' | 'rejected';
  items: TransferItem[];
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
}
export interface TransferFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}
export interface NewTransferRequest {
  studentId: string;
  curriculumId: string | null;
  curriculumDocumentId: string | null;
  curriculumName: string;
  sourceInstitution: string;
  sourceMajor?: string;
  ocrText?: string;
  documentPath: string;
  documentName: string;
  documentMime: string;
  documentSize: number;
  items: TransferItem[];
}

export type StoredReviewDecision = ReviewDecision & { match?: TransferMapping | null };
