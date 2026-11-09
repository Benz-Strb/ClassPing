import { apiFetch } from "./api";
export const TRANSFER_STATUS = {
  pending: "รออาจารย์พิจารณา",
  approved: "อนุมัติทั้งหมด",
  partially_approved: "อนุมัติบางรายวิชา",
  rejected: "ปฏิเสธ",
};
export interface TransferMapping {
  id: string;
  curriculumId: string;
  sourceInstitution: string;
  sourceCode: string;
  sourceName: string;
  minCredits: number;
  targetCode: string;
  targetName: string;
  targetCredits: number;
  active: boolean;
}
export interface TransferItem {
  id: string;
  sourceCode: string;
  sourceName: string;
  credits: number;
  grade: string;
  match: TransferMapping | null;
  matchSource?: 'history' | 'curriculum' | 'mapping';
  previousApproval?: { requestId: string; reviewedAt: string };
  decision?: "approved" | "rejected";
  note?: string;
}
export interface TransferRequest {
  id: string;
  studentName: string | null;
  studentCode: string | null;
  curriculumName: string;
  sourceInstitution: string;
  sourceMajor?: string;
  ocrText?: string;
  curriculumDocumentId?: string | null;
  status: keyof typeof TRANSFER_STATUS;
  items: TransferItem[];
  documentName: string;
  createdAt: string;
  reviewedAt: string | null;
}
export interface TransferCurriculum {
  id: string;
  curriculumId: string;
  curriculumName: string;
  year: number;
  fileName: string;
  sourceInstitutions: string[];
  sourceInstitution?: string;
  sourceMajor?: string;
  courses?: ExtractedCourse[];
  ocrText?: string;
}
export const inputClass = "w-full rounded border border-gray-300 px-3 py-2";
export const buttonClass =
  "rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50";
export async function openTransferDocument(path: string) {
  const tab = window.open("", "_blank");
  if (tab) tab.opener = null;
  try {
    const { url } = await apiFetch<{ url: string }>(path);
    if (tab) tab.location.replace(url);
    else window.location.assign(url);
  } catch (error) {
    tab?.close();
    throw error;
  }
}

export interface ExtractedCourse { sourceCode: string; sourceName: string; credits: number; grade: string }
export interface TransferDraft { sourceInstitution: string; sourceMajor: string; courses: ExtractedCourse[]; ocrText: string; warnings: string[] }
