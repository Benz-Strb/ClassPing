"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

type Phase = 'idle' | 'fold' | 'cover' | 'reveal';
const TransitionContext = createContext({ begin: async () => {}, arrive: () => {} });
export const useLoginTransition = () => useContext(TransitionContext);

export function LoginTransition({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const active = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const begin = useCallback(async () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    active.current = true;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setPhase('fold');
    await new Promise<void>((resolve) => {
      timers.current.push(setTimeout(() => setPhase('cover'), reduced ? 0 : 360));
      timers.current.push(setTimeout(resolve, reduced ? 0 : 850));
    });
    timers.current.push(setTimeout(() => { active.current = false; setPhase('idle'); }, 15_000));
  }, []);

  const arrive = useCallback(() => {
    if (!active.current) return;
    active.current = false;
    timers.current.forEach(clearTimeout);
    setPhase('reveal');
    timers.current = [setTimeout(() => setPhase('idle'), 750)];
  }, []);

  return <TransitionContext.Provider value={{ begin, arrive }}>
    <div className="auth-stage" data-phase={phase}>{children}</div>
    {phase !== 'idle' && <div className="auth-transition-cover" data-phase={phase} role="status" aria-live="polite"><span className="auth-transition-mark" aria-hidden="true">C</span><span className="sr-only">กำลังเปิดหน้าแรก...</span></div>}
  </TransitionContext.Provider>;
}

export function LoginArrival() {
  const { arrive } = useLoginTransition();
  useEffect(() => { arrive(); }, [arrive]);
  return null;
}
