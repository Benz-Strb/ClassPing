import { File } from "expo-file-system";
import { Linking } from "react-native";
import { apiFetch } from "./api";

export const TRANSFER_STATUS = {
  pending: "รออาจารย์อนุมัติ",
  approved: "อนุมัติทั้งหมด",
  partially_approved: "อนุมัติบางรายวิชา",
  rejected: "ปฏิเสธ",
} as const;
export interface TransferCurriculum {
  id: string;
  curriculumName: string;
  year: number;
  sourceInstitutions: string[];
}
export interface TransferCourse {
  sourceCode: string;
  sourceName: string;
  credits: string;
  grade: string;
}
export interface TransferRequest {
  id: string;
  curriculumName: string;
  sourceInstitution: string;
  status: keyof typeof TRANSFER_STATUS;
  documentName: string;
  createdAt: string;
  sourceMajor?: string;
  items: {
    id: string;
    sourceCode: string;
    sourceName: string;
    credits: number;
    grade: string;
    match: {
      targetCode: string;
      targetName: string;
      targetCredits: number;
    } | null;
    decision?: "approved" | "rejected";
    note?: string;
  }[];
}
export async function openTransferDocument(path: string) {
  const { url } = await apiFetch<{ url: string }>(path);
  await Linking.openURL(url);
}
export interface TransferDraft {
  sourceInstitution: string;
  sourceMajor: string;
  courses: {
    sourceCode: string;
    sourceName: string;
    credits: number;
    grade: string;
  }[];
  ocrText: string;
  warnings: string[];
}
export async function previewTransfer(uri: string) {
  const form = new FormData();
  form.append("document", new File(uri));
  return apiFetch<TransferDraft>(
    "/transfers/preview",
    { method: "POST", body: form },
    120_000,
  );
}
export async function submitTransfer(
  curriculumDocumentId: string | null,
  sourceInstitution: string,
  courses: TransferCourse[],
  uri: string,
  sourceMajor: string,
  ocrText: string,
) {
  const form = new FormData();
  form.append(
    "payload",
    JSON.stringify({
      curriculumDocumentId,
      sourceInstitution,
      sourceMajor,
      ocrText,
      courses: courses.map((c) => ({
        ...c,
        sourceCode: c.sourceCode.trim(),
        sourceName: c.sourceName.trim(),
        grade: c.grade.trim(),
        credits: Number(c.credits),
      })),
    }),
  );
  form.append("document", new File(uri));
  return apiFetch<TransferRequest>(
    "/transfers/requests",
    { method: "POST", body: form },
    120_000,
  );
}
