import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { requireWebUser } from '@/lib/web-session';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireWebUser();
  if (user.role !== 'admin') redirect('/me');

  return (
    <main className="admin-workspace fixed-workspace mx-auto p-4 sm:p-6">
      <header className="admin-heading space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">ระบบผู้ดูแล</h1>
        </div>
      </header>
      <div className="workspace-body">{children}</div>
    </main>
  );
}
