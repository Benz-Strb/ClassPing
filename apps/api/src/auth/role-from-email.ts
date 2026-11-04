export type Role = 'student' | 'teacher' | 'admin';

export interface ClassifiedEmail {
  email: string;
  role: Role;
  studentId: string | null;
}

const ALLOWED_DOMAIN = 'dpu.ac.th';

// บัญชีใหม่เริ่มด้วยสิทธิ์นักศึกษา อาจารย์ต้องได้รับมอบหมายบทบาทจากแอดมิน
export function classifyEmail(
  rawEmail: string,
  adminEmails: string[],
): ClassifiedEmail | null {
  const email = rawEmail.trim().toLowerCase();
  const parts = email.split('@');
  if (parts.length !== 2) return null;

  const [local, domain] = parts;
  if (!local || domain !== ALLOWED_DOMAIN) return null;

  const studentId = /^\d+$/.test(local) ? local : null;

  // แอดมินที่เป็นนักศึกษาด้วยยังเก็บรหัสไว้ ลงทะเบียนใบหน้าได้
  const admins = adminEmails.map((e) => e.trim().toLowerCase());
  if (admins.includes(email)) {
    return { email, role: 'admin', studentId };
  }

  return { email, role: 'student', studentId };
}
