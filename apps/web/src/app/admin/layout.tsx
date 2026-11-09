"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { handleApiError } from "@/lib/auth-error";
import type { Me } from "@/lib/types";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Me>("/me")
      .then((me) => {
        if (me.role !== "admin") {
          router.replace("/me");
          return;
        }
        setAllowed(true);
      })
      .catch(async (value: unknown) =>
        setError(await handleApiError(value, router)),
      );
  }, [router]);

  if (error)
    return (
      <p className="p-6 text-red-700" role="alert">
        {error}
      </p>
    );
  if (!allowed)
    return (
      <p className="p-6" role="status">
        กำลังตรวจสอบสิทธิ์...
      </p>
    );

  return (
    <main className="admin-workspace fixed-workspace mx-auto p-4 sm:p-6">
      <header className="admin-heading space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">ระบบผู้ดูแล</h1>
        </div>
      </header>
      <div className="workspace-body">{children}</div>
    </main>
  );
}
