"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ApiError, apiFetch } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import type { Me } from "@/lib/types";

const STUDENT_MESSAGE = "เว็บไซต์สำหรับผู้ดูแลระบบและอาจารย์เท่านั้น นักศึกษากรุณาใช้งานผ่านแอป ClassPing รวมถึงการยื่นลาและเทียบโอน";

export function WebAccess({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [checkedPath, setCheckedPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (pathname.startsWith("/auth/")) return;
    let active = true;
    let revision = 0;
    let timer: ReturnType<typeof setTimeout>;
    async function check() {
      const current = ++revision;
      setCheckedPath(null);
      setError(null);
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        const me = data.session ? await apiFetch<Me>("/me") : null;
        if (!active || current !== revision) return;
        if (me && me.role !== "admin" && me.role !== "teacher") {
          const { error } = await supabase.auth.signOut({ scope: "local" });
          if (error) throw error;
          if (active) router.replace(`/login?error=${encodeURIComponent(STUDENT_MESSAGE)}`);
          return;
        }
        if (!me && pathname !== "/" && pathname !== "/login") {
          router.replace("/login");
          return;
        }
        if (pathname === "/leave" || pathname === "/transfers" || pathname.startsWith("/transfers/")) {
          router.replace("/courses");
          return;
        }
        setCheckedPath(pathname);
      } catch (value) {
        if (!active || current !== revision) return;
        if (value instanceof ApiError && value.status === 401) {
          await supabase.auth.signOut({ scope: "local" });
          if (active) router.replace("/login");
          return;
        }
        if (active && current === revision) setError(value instanceof Error ? value.message : "ตรวจสอบสิทธิ์ไม่สำเร็จ");
      }
    }
    void check();
    const { data } = supabase.auth.onAuthStateChange(() => {
      ++revision;
      setCheckedPath(null);
      clearTimeout(timer);
      timer = setTimeout(() => void check(), 0);
    });
    return () => { active = false; ++revision; clearTimeout(timer); data.subscription.unsubscribe(); };
  }, [pathname, retry, router]);

  if (pathname.startsWith("/auth/")) return children;
  if (error) return <main className="login-layout"><section className="login-panel"><p role="alert">{error}</p><button type="button" onClick={() => setRetry((value) => value + 1)}>ลองใหม่</button></section></main>;
  if (checkedPath !== pathname) return <p className="p-6" role="status">กำลังตรวจสอบสิทธิ์...</p>;
  return children;
}
