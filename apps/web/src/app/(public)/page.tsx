import { ApplicationShell } from '@/components/application-shell';
import Home from '@/components/home-page';
import { getWebUser } from '@/lib/web-session';
import LoginScreen from '@/components/login-screen';
import { Suspense } from 'react';

export default function HomePage() {
  return <Suspense fallback={<p role="status" className="p-6">กำลังโหลด...</p>}>
    <HomePageContent />
  </Suspense>;
}

async function HomePageContent() {
  const user = await getWebUser();
  if (!user) return <LoginScreen />;
  return <ApplicationShell user={user}><Home /></ApplicationShell>;
}
