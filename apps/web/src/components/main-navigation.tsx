"use client";

import Link from "next/link";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useWebUser } from "@/components/web-access";
import { navigationFor } from "@/lib/navigation";

export function MainNavigation() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const me = useWebUser();
  const links = navigationFor(me?.role ?? null);
  if (pathname === "/login" || pathname.startsWith("/auth/")) return null;
  const iconFor = (href: string) => href.includes("courses") || href.includes("curricula") ? "courses" : href.includes("transfers") ? "transfer" : href.includes("leave") ? "leave" : href === "/me" ? "user" : href.startsWith('/live') ? 'camera' : href.startsWith('/admin') ? 'admin' : href.startsWith('/transfers') ? 'transfer' : href === '/login' ? 'login' : "home";
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
        {links.map(({ href, label }) => (
          <Link key={href} href={href} onClick={() => setOpen(false)} aria-current={pathname === href || (href === "/documents" && (pathname.startsWith("/documents/") || pathname.startsWith("/leave/") || pathname === "/admin/transfers" || pathname === "/admin/leave-statuses")) || (href !== "/" && href !== "/admin" && pathname.startsWith(`${href}/`)) ? "page" : undefined} className="navigation-link">
            <span aria-hidden="true" className="navigation-icon" style={{ maskImage: `url(/icons/${iconFor(href)}.svg)` }} />
            {label}
          </Link>
        ))}
        <div className="navigation-footer">{me && <Link href="/me" className="navigation-account" onClick={() => setOpen(false)}><span className="navigation-avatar" aria-hidden="true">{(me.fullName ?? me.email).slice(0, 1).toUpperCase()}</span><span><strong>{me.fullName ?? 'บัญชีของฉัน'}</strong><small>{me.role === 'admin' ? 'ผู้ดูแลระบบ' : me.role === 'teacher' ? 'อาจารย์' : 'นักศึกษา'}</small></span></Link>}<p>DPU · @dpu.ac.th</p></div>
      </div>
    </nav>
  );
}
