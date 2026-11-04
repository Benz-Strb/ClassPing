"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { handleApiError } from "@/lib/auth-error";
import type { Me } from "@/lib/types";

export function LeaveAccess({ role, children }: { role: "student" | "teacher"; children: ReactNode }) {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiFetch<Me>("/me").then((me) => {
      if (!active) return;
      if (me.role !== role || (role === "student" && !me.studentId)) {
        router.replace(me.role === "teacher" ? "/leave/review" : "/me");
        return;
      }
      setAllowed(true);
    }).catch(async (value: unknown) => {
      const message = await handleApiError(value, router);
      if (active) setError(message);
    });
    return () => { active = false; };
  }, [role, router]);

  if (error) return <p className="p-6 text-red-700" role="alert">{error}</p>;
  if (!allowed) return <p className="p-6" role="status">กำลังตรวจสอบสิทธิ์...</p>;
  return children;
}
