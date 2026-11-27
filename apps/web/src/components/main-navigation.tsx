"use client";

import Link from "next/link";
import { ProfileAvatar } from "@/components/profile-avatar";

import { useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useWebUser } from "@/components/web-access";
import { navigationFor } from "@/lib/navigation";

export function MainNavigation() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const itemsRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const me = useWebUser();
  const links = navigationFor(me?.role ?? null);
  const role = me?.role;

  useLayoutEffect(() => {
    const items = itemsRef.current;
    const indicator = indicatorRef.current;
    if (!items || !indicator) return;
    const active = items.querySelector<HTMLElement>('[aria-current="page"]');
    if (!active) {
      delete items.dataset.indicator;
      return;
    }

    const positionIndicator = () => {
      if (!active.offsetHeight) {
        delete items.dataset.indicator;
        return;
      }
      indicator.style.height = `${active.offsetHeight}px`;
      indicator.style.transform = `translateY(${active.offsetTop}px)`;
      items.dataset.indicator = "ready";
    };

    positionIndicator();
    const observer = new ResizeObserver(positionIndicator);
    observer.observe(items);
    for (const link of items.querySelectorAll(".navigation-link")) observer.observe(link);
    return () => observer.disconnect();
  }, [open, pathname, role]);

  if (pathname === "/login" || pathname.startsWith("/auth/")) return null;
  const iconFor = (href: string) => href.includes("courses") || href.includes("curricula") ? "courses" : href.includes("leave") ? "leave" : href === "/me" ? "user" : href.startsWith('/live') ? 'camera' : href.startsWith('/admin') ? 'admin' : href === '/login' ? 'login' : "home";
  return (
    <nav aria-label="เมนูหลัก" className="app-navigation">
      <div className="navigation-heading">
        <div>
          <Link href={me?.role === "admin" ? "/admin" : "/"} className="navigation-brand"><span className="brand-mark" aria-hidden="true">C</span>ClassPing</Link>
          <p className="navigation-role">{me?.role === "admin" ? "พื้นที่ผู้ดูแลระบบ" : me?.role === "teacher" ? "พื้นที่อาจารย์" : "ระบบจัดการการเข้าเรียน"}</p>
        </div>
        <button className="navigation-toggle" type="button" aria-expanded={open} aria-controls="main-navigation-links" onClick={() => setOpen(!open)}>{open ? "ปิดเมนู" : "เมนู"}</button>
      </div>
      <div id="main-navigation-links" className="navigation-links" data-open={open}>
        <div ref={itemsRef} className="navigation-items">
          <span ref={indicatorRef} className="navigation-indicator" aria-hidden="true" />
          {links.map(({ href, label }) => (
            <Link key={href} href={href} onClick={() => setOpen(false)} aria-current={pathname === href || (href === "/documents" && (pathname.startsWith("/documents/") || pathname.startsWith("/leave/") || pathname === "/admin/leave-statuses")) || (href !== "/" && href !== "/admin" && pathname.startsWith(`${href}/`)) ? "page" : undefined} className="navigation-link">
              <span aria-hidden="true" className="navigation-icon" style={{ maskImage: `url(/icons/${iconFor(href)}.svg)` }} />
              {label}
            </Link>
          ))}
        </div>
        <div className="navigation-footer">{me && <Link href="/me" className="navigation-account" onClick={() => setOpen(false)}><ProfileAvatar user={me} className="navigation-avatar" /><span><strong>{me.fullName ?? 'บัญชีของฉัน'}</strong><small>{me.role === 'admin' ? 'ผู้ดูแลระบบ' : 'อาจารย์'}</small></span></Link>}<p>DPU · @dpu.ac.th</p></div>
      </div>
    </nav>
  );
}
