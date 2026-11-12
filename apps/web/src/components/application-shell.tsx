import { Suspense, type ReactNode } from 'react';
import { MainNavigation } from './main-navigation';
import { WebAccess } from './web-access';
import { LoginArrival } from './login-transition';
import type { Me } from '@/lib/types';

export function ApplicationShell({ children, user }: { children: ReactNode; user: Me | null }) {
  return <WebAccess user={user}>
    <LoginArrival />
    <div className="app-shell">
      <Suspense fallback={<nav aria-label="เมนูหลัก" className="app-navigation" aria-busy="true">ClassPing</nav>}><MainNavigation /></Suspense>
      <div id="main-content" className="app-content" tabIndex={-1}>{children}</div>
    </div>
  </WebAccess>;
}
