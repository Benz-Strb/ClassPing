"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function TeacherNavigation() {
  const pathname = usePathname();
  return <nav aria-label="เมนูหลักสูตร" className="admin-tabs">
    <Link href="/teacher/curricula" aria-current={pathname === '/teacher/curricula' ? 'page' : undefined} className="admin-tab">หลักสูตร</Link>
  </nav>;
}
