"use client";

import type { ReactNode } from 'react';
import { LoginBackdrop } from './login-backdrop';

export function LoginScene({ children }: { children: ReactNode }) {
  return <main id="main-content" className="signin-page">
    <LoginBackdrop />
    <div className="signin-body">
      <div className="signin-card-motion">
      <section className="signin-form" aria-label="เข้าสู่ระบบบัญชีมหาวิทยาลัย">
        {children}
      </section>
      </div>
    </div>
  </main>;
}
