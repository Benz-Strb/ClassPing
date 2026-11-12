"use client";

import type { PointerEvent, ReactNode } from 'react';
import { LoginBackdrop } from './login-backdrop';

function moveCard(event: PointerEvent<HTMLDivElement>) {
  if (event.pointerType !== 'mouse' || !window.matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)').matches) return;
  const card = event.currentTarget;
  const bounds = card.getBoundingClientRect();
  const x = (event.clientX - bounds.left) / bounds.width - .5;
  const y = (event.clientY - bounds.top) / bounds.height - .5;
  card.style.setProperty('--tilt-x', `${-y * 5}deg`);
  card.style.setProperty('--tilt-y', `${x * 5}deg`);
}

function resetCard(event: PointerEvent<HTMLDivElement>) {
  event.currentTarget.style.removeProperty('--tilt-x');
  event.currentTarget.style.removeProperty('--tilt-y');
}

function moveBackground(event: PointerEvent<HTMLElement>) {
  if (event.pointerType !== 'mouse' || !window.matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)').matches) return;
  const page = event.currentTarget;
  const bounds = page.getBoundingClientRect();
  const x = event.clientX - bounds.left;
  const y = event.clientY - bounds.top;
  page.style.setProperty('--pointer-x', `${x}px`);
  page.style.setProperty('--pointer-y', `${y}px`);
  page.style.setProperty('--drift-x', `${(x / bounds.width - .5) * 44}px`);
  page.style.setProperty('--drift-y', `${(y / bounds.height - .5) * 44}px`);
  page.dataset.pointer = 'active';
}

function resetBackground(event: PointerEvent<HTMLElement>) {
  const page = event.currentTarget;
  delete page.dataset.pointer;
  page.style.setProperty('--drift-x', '0px');
  page.style.setProperty('--drift-y', '0px');
}

export function LoginScene({ children }: { children: ReactNode }) {
  return <main id="main-content" className="signin-page" onPointerMove={moveBackground} onPointerLeave={resetBackground} onPointerCancel={resetBackground}>
    <LoginBackdrop />
    <div className="signin-body">
      <div className="signin-card-motion" onPointerMove={moveCard} onPointerLeave={resetCard} onPointerCancel={resetCard}>
      <section className="signin-form" aria-label="เข้าสู่ระบบบัญชีมหาวิทยาลัย">
        <div className="signin-form-mark" aria-hidden="true"><span className="signin-scan" /><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M8 5H5v7m19-7h3v7M5 21v6h7m15-6v6h-7M11 13h.01M21 13h.01M11 20c3 3 7 3 10 0" strokeLinecap="round" /></svg></div>
        {children}
      </section>
      </div>
    </div>
  </main>;
}
