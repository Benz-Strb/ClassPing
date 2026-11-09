"use client";

import Link from "next/link";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { navigationFor } from "@/lib/navigation";
import { supabase } from "@/lib/supabase";
import type { Me } from "@/lib/types";

export function MainNavigation() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let disposed = false;
    let revision = 0;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      const current = ++revision;
      setMe(null); setLoading(true); setFailed(false);
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        const user = data.session ? await apiFetch<Me>("/me") : null;
        if (!disposed && current === revision) setMe(user);
      } catch {
        if (!disposed && current === revision) setFailed(true);
      } finally {
        if (!disposed && current === revision) setLoading(false);
      }
    }
    void refresh();
    const { data } = supabase.auth.onAuthStateChange(() => {
      ++revision;
      setMe(null); setLoading(true);
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 0);
    });
    return () => { disposed = true; clearTimeout(timer); data.subscription.unsubscribe(); };
  }, [pathname, retry]);

  const links = loading || failed ? [{ href: "/", label: "หน้าหลัก" }] : navigationFor(me?.role ?? null);
  if (pathname === "/login" || pathname.startsWith("/auth/")) return null;
  const iconFor = (href: string) => href.includes("courses") || href.includes("curricula") ? "courses" : href.includes("transfers") ? "transfer" : href.includes("leave") ? "leave" : href === "/me" ? "user" : href.startsWith('/live') ? 'camera' : href.startsWith('/admin') ? 'admin' : href.startsWith('/transfers') ? 'transfer' : href === '/login' ? 'login' : "home";
  return (
    <nav aria-label="เมนูหลัก" className="app-navigation">
      <div className="navigation-heading">
        <div>
          <Link href="/" className="navigation-brand"><span className="brand-mark" aria-hidden="true">C</span>ClassPing</Link>
          <p className="navigation-role">{me?.role === "admin" ? "พื้นที่ผู้ดูแลระบบ" : me?.role === "teacher" ? "พื้นที่อาจารย์" : "ระบบจัดการการเข้าเรียน"}</p>
        </div>
        <button className="navigation-toggle" type="button" aria-expanded={open} aria-controls="main-navigation-links" onClick={() => setOpen(!open)}>{open ? "ปิดเมนู" : "เมนู"}</button>
      </div>
      <div id="main-navigation-links" className="navigation-links" data-open={open}>
        {links.map(({ href, label }) => (
          <Link key={href} href={href} onClick={() => setOpen(false)} aria-current={pathname === href || (href === "/documents" && (pathname.startsWith("/documents/") || pathname.startsWith("/leave/") || pathname === "/admin/transfers" || pathname === "/admin/leave-statuses")) || (href !== "/" && pathname.startsWith(`${href}/`)) ? "page" : undefined} className="navigation-link">
            <span aria-hidden="true" className="navigation-icon" style={{ maskImage: `url(/icons/${iconFor(href)}.svg)` }} />
            {label}
          </Link>
        ))}
        {loading && <span role="status" className="text-sm text-gray-600">กำลังตรวจสอบสิทธิ์...</span>}
        {failed && <button type="button" onClick={() => setRetry((value) => value + 1)} className="rounded border px-3 py-1">โหลดเมนูใหม่</button>}
        <div className="navigation-footer">{me && <Link href="/me" className="navigation-account" onClick={() => setOpen(false)}><span className="navigation-avatar" aria-hidden="true">{(me.fullName ?? me.email).slice(0, 1).toUpperCase()}</span><span><strong>{me.fullName ?? 'บัญชีของฉัน'}</strong><small>{me.role === 'admin' ? 'ผู้ดูแลระบบ' : me.role === 'teacher' ? 'อาจารย์' : 'นักศึกษา'}</small></span></Link>}<p>DPU · @dpu.ac.th</p></div>
      </div>
    </nav>
  );
}
