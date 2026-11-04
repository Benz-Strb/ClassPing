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
  return (
    <nav aria-label="เมนูหลัก" className="flex flex-wrap gap-2 border-b p-3">
      {links.map(({ href, label }) => (
        <Link key={href} href={href} aria-current={pathname === href || (href !== "/" && pathname.startsWith(`${href}/`)) ? "page" : undefined} className="rounded border bg-white px-3 py-1 aria-[current=page]:font-semibold">
          {label}
        </Link>
      ))}
      {loading && <span role="status" className="px-3 py-1 text-sm text-gray-600">กำลังตรวจสอบสิทธิ์...</span>}
      {failed && <button type="button" onClick={() => setRetry((value) => value + 1)} className="rounded border px-3 py-1">โหลดเมนูใหม่</button>}
    </nav>
  );
}
