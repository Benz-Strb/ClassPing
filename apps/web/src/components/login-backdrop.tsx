"use client";

import { useEffect, useRef, type CSSProperties } from 'react';

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
    <div className="signin-pointer-light" />
    <div className="signin-wash signin-wash-one" />
    <div className="signin-wash signin-wash-two" />
    <div className="signin-wash signin-wash-three" />
    <div className="signin-particles">
      {Array.from({ length: 18 }, (_, index) => <span key={index} className="signin-particle" style={{
        '--x': `${(index * 37 + 7) % 100}%`, '--y': `${(index * 23 + 11) % 100}%`,
        '--size': `${4 + index % 4 * 3}px`, '--duration': `${12 + index % 5 * 3}s`, '--delay': `${index * -1.7}s`,
      } as CSSProperties} />)}
    </div>
    <div className="signin-ripples"><span /><span /><span /></div>
    <svg className="signin-orbits" viewBox="0 0 1440 1000" preserveAspectRatio="xMidYMid slice" fill="none">
      <g className="signin-streams">
        <path d="M-100 620C180 240 300 950 620 800S1070 160 1540 400" />
        <path d="M-100 650C210 270 330 980 650 830S1100 190 1540 430" />
        <path d="M-100 590C150 210 270 920 590 770S1040 130 1540 370" />
      </g>
      <g className="signin-orbit-one">
        <circle cx="60" cy="120" r="180" /><circle cx="60" cy="120" r="255" /><circle cx="60" cy="120" r="330" />
        <circle className="signin-orbit-dot" cx="240" cy="120" r="5" /><circle className="signin-orbit-dot" cx="60" cy="375" r="4" />
      </g>
      <g className="signin-orbit-two">
        <circle cx="1390" cy="920" r="210" /><circle cx="1390" cy="920" r="290" /><circle cx="1390" cy="920" r="370" />
        <circle className="signin-orbit-dot" cx="1100" cy="920" r="5" /><circle className="signin-orbit-dot" cx="1390" cy="710" r="4" />
      </g>
    </svg>
  </div>;
}
