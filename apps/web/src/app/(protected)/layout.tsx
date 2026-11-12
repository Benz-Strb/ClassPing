import { ApplicationShell } from '@/components/application-shell';
import { requireWebUser } from '@/lib/web-session';
import { Suspense } from 'react';

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<p role="status" className="p-6">กำลังโหลด...</p>}>
    <ProtectedContent>{children}</ProtectedContent>
  </Suspense>;
}

async function ProtectedContent({ children }: { children: React.ReactNode }) {
  const user = await requireWebUser();
  return <ApplicationShell user={user}>{children}</ApplicationShell>;
}
