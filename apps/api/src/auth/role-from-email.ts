export type Role = 'student' | 'teacher' | 'admin';

export interface ClassifiedEmail {
  email: string;
  role: Role;
  studentId: string | null;
}

const ALLOWED_DOMAIN = 'dpu.ac.th';

// นักศึกษาและอาจารย์ใช้โดเมนเดียวกัน แยกจากส่วนหน้า @
// เลขล้วน = รหัสนักศึกษา, อย่างอื่น = อาจารย์, แอดมินดูจากรายชื่อใน env
export function classifyEmail(
  rawEmail: string,
  adminEmails: string[],
): ClassifiedEmail | null {
  const email = rawEmail.trim().toLowerCase();
  const parts = email.split('@');
  if (parts.length !== 2) return null;

  const [local, domain] = parts;
  if (!local || domain !== ALLOWED_DOMAIN) return null;

  const admins = adminEmails.map((e) => e.trim().toLowerCase());
  if (admins.includes(email)) {
    return { email, role: 'admin', studentId: null };
  }

  if (/^\d+$/.test(local)) {
    return { email, role: 'student', studentId: local };
  }

  return { email, role: 'teacher', studentId: null };
}
