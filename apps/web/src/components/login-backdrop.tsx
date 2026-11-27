"use client";

import { useEffect, useRef } from 'react';

export function LoginBackdrop() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let visible = true;
    const update = () => {
      if (ref.current) ref.current.dataset.paused = String(document.hidden || !visible);
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      update();
    });
    if (ref.current) observer.observe(ref.current);
    document.addEventListener('visibilitychange', update);
    update();
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', update);
    };
  }, []);

  return <div ref={ref} className="signin-backdrop" aria-hidden="true">
    <div className="signin-mist" />
  </div>;
}
