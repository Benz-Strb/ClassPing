import type { Role } from './types.ts';

const COMMON = [{ href: '/', label: 'หน้าหลัก' }, { href: '/me', label: 'บัญชี' }];
const TEACHER = [{ href: '/courses', label: 'รายวิชา' }, { href: '/live', label: 'กล้อง' }, { href: '/leave/review', label: 'ตรวจใบลา' }];
export function navigationFor(role: Role | null) {
  if (!role) return [{ href: '/', label: 'หน้าหลัก' }, { href: '/login', label: 'เข้าสู่ระบบ' }];
  const links = role === 'student'
    ? [{ href: '/leave', label: 'ยื่นลา' }, { href: '/transfers', label: 'เทียบโอน' }]
    : role === 'teacher' ? TEACHER : [...TEACHER, { href: '/admin', label: 'ระบบผู้ดูแล' }];
  return [COMMON[0], ...links, COMMON[1]];
}
