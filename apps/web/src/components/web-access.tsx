"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ApiError, apiFetch } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import type { Me } from "@/lib/types";

const STUDENT_MESSAGE = "เว็บไซต์สำหรับผู้ดูแลระบบและอาจารย์เท่านั้น นักศึกษากรุณาใช้งานผ่านแอป ClassPing รวมถึงการยื่นลา";

const WebUserContext = createContext<Me | null>(null);

export function useWebUser() {
  return useContext(WebUserContext);
}

export function WebAccess({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [user, setUser] = useState<Me | null>(null);
  const authCallback = pathname.startsWith("/auth/");
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (authCallback) return;
    let active = true;
    let revision = 0;
    let verifiedUserId: string | null | undefined;
    let timer: ReturnType<typeof setTimeout>;
    async function check(block = true) {
      const current = ++revision;
      if (block) setChecked(false);
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
        verifiedUserId = data.session?.user.id ?? null;
        setUser(me);
        setChecked(true);
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
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION") return;
      const sameUser = verifiedUserId !== undefined && verifiedUserId === (session?.user.id ?? null);
      if (event === "SIGNED_IN" && sameUser) return;
      const block = !sameUser || event === "SIGNED_OUT" || event === "USER_UPDATED";
      ++revision;
      if (block) setChecked(false);
      clearTimeout(timer);
      timer = setTimeout(() => void check(block), 0);
    });
    return () => { active = false; ++revision; clearTimeout(timer); data.subscription.unsubscribe(); };
  }, [authCallback, retry, router]);

  const redirect = checked && !authCallback
    ? !user && pathname !== "/" && pathname !== "/login"
      ? "/login"
      : pathname === "/leave"
        ? "/courses"
        : null
    : null;

  useEffect(() => {
    if (redirect) router.replace(redirect);
  }, [redirect, router]);

  if (pathname.startsWith("/auth/")) return children;
  if (error) return <main className="login-layout"><section className="login-panel"><p role="alert">{error}</p><button type="button" onClick={() => setRetry((value) => value + 1)}>ลองใหม่</button></section></main>;
  if (!checked || redirect) return <p className="p-6" role="status">กำลังตรวจสอบสิทธิ์...</p>;
  return <WebUserContext.Provider value={user}>{children}</WebUserContext.Provider>;
}
