import type { Role } from './types.ts';

const COMMON = [{ href: '/', label: 'หน้าหลัก' }, { href: '/me', label: 'บัญชี' }];
const STAFF = [{ href: '/courses', label: 'รายวิชา' }, { href: '/live', label: 'กล้อง' }];
const TEACHER = [...STAFF, { href: '/leave/review', label: 'ตรวจใบลา' }, { href: '/teacher/curricula', label: 'หลักสูตร' }];
const ADMIN = [
  { href: '/admin', label: 'ภาพรวม' },
  { href: '/admin/users', label: 'ผู้ใช้' },
  { href: '/admin/rooms', label: 'ห้องเรียน' },
  { href: '/live', label: 'ดูกล้อง' },
  { href: '/admin/cameras', label: 'กล้องประจำห้อง' },
  { href: '/admin/video-views', label: 'ประวัติการดูกล้อง' },
  { href: '/admin/courses', label: 'รายวิชาและตารางเรียน' },
  { href: '/admin/knowledge', label: 'แหล่งความรู้' },
];
export function navigationFor(role: Role | null) {
  if (!role) return [{ href: '/', label: 'หน้าหลัก' }, { href: '/login', label: 'เข้าสู่ระบบ' }];
  if (role === 'admin') return ADMIN;
  const links = role === 'student'
    ? [{ href: '/leave', label: 'ยื่นลา' }]
    : role === 'teacher' ? TEACHER : [...STAFF, { href: '/admin', label: 'ระบบผู้ดูแล' }];
  return [COMMON[0], ...links, COMMON[1]];
}
