import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { requireWebUser } from '@/lib/web-session';
import { TeacherNavigation } from '@/components/teacher-navigation';

export default async function TeacherLayout({ children }: { children: ReactNode }) {
  const user = await requireWebUser();
  if (user.role !== 'teacher') redirect('/me');

  return (
    <main className="admin-workspace fixed-workspace mx-auto p-4 sm:p-6">
      <header className="admin-heading space-y-4">
        <h1 className="text-2xl font-semibold">หลักสูตร</h1>
        <TeacherNavigation />
      </header>
      <div className="workspace-body">{children}</div>
    </main>
  );
}
