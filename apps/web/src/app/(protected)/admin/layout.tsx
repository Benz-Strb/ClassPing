import { Suspense, type ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { requireWebUser } from '@/lib/web-session';

// อ่าน session ใน component ข้างใน Suspense หัวหน้าแสดงได้ทันที (Cache Components ห้าม await นอก Suspense)
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <main className="admin-workspace fixed-workspace mx-auto p-4 sm:p-6">
      <header className="admin-heading space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">ระบบผู้ดูแล</h1>
        </div>
      </header>
      <Suspense fallback={<p role="status" className="p-6">กำลังโหลด...</p>}>
        <AdminOnly>{children}</AdminOnly>
      </Suspense>
    </main>
  );
}

async function AdminOnly({ children }: { children: ReactNode }) {
  const user = await requireWebUser();
  if (user.role !== 'admin') redirect('/me');
  return <div className="workspace-body">{children}</div>;
}
