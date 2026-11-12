import { Suspense, type ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { requireWebUser } from '@/lib/web-session';
import { TeacherNavigation } from '@/components/teacher-navigation';

// อ่าน session ใน component ข้างใน Suspense หัวหน้าแสดงได้ทันที (Cache Components ห้าม await นอก Suspense)
export default function TeacherLayout({ children }: { children: ReactNode }) {
  return (
    <main className="admin-workspace fixed-workspace mx-auto p-4 sm:p-6">
      <header className="admin-heading space-y-4">
        <h1 className="text-2xl font-semibold">หลักสูตร</h1>
        <TeacherNavigation />
      </header>
      <Suspense fallback={<p role="status" className="p-6">กำลังโหลด...</p>}>
        <TeacherOnly>{children}</TeacherOnly>
      </Suspense>
    </main>
  );
}

async function TeacherOnly({ children }: { children: ReactNode }) {
  const user = await requireWebUser();
  if (user.role !== 'teacher') redirect('/me');
  return <div className="workspace-body">{children}</div>;
}
