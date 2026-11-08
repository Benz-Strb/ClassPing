export type CatalogKind = "curricula" | "reference" | "knowledge";
export interface CatalogEntry {
  id: string;
  kind: CatalogKind;
  code: string | null;
  name: string;
  year: number | null;
  category: string | null;
  url: string | null;
  content: string;
  active: boolean;
  ragStatus?: "synced" | "pending" | "inactive";
}
export interface Camera {
  id: string;
  roomId: string;
  roomName: string;
  kind: "front" | "door";
  lastSeenAt: string | null;
  hasToken: boolean;
}
export interface CameraToken { cameraId: string; roomId: string; token: string }

export async function readAdminText(file: File): Promise<string> {
  if (file.size > 200_000) throw new Error("ไฟล์ต้องไม่เกิน 200 KB");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
  } catch {
    throw new Error("อ่านไฟล์ไม่ได้ กรุณาบันทึกไฟล์เป็น UTF-8");
  }
}

export interface VideoView {
  viewedAt: string;
  // ดูต่อเนื่องถึงเวลานี้
  until: string;
  kind: "live" | "playback" | "download";
  viewerName: string | null;
  viewerEmail: string;
  courseCode: string;
  courseName: string;
  roomName: string;
  startsAt: string;
  endsAt: string;
  sessionKind: "class" | "exam";
  sessionTitle: string | null;
  isTeacherOfCourse: boolean;
}
