"use client";

import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { useWebUser } from './web-access';

export function LeaveAccess({ role, children }: { role: "student" | "teacher"; children: ReactNode }) {
  const user = useWebUser();
  if (!user) redirect('/login');
  if (user.role !== role || (role === 'student' && !user.studentId)) {
    redirect(user.role === 'teacher' ? '/leave/review' : '/me');
  }
  return children;
}
