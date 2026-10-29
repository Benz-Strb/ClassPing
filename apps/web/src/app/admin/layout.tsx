"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { handleApiError } from "@/lib/auth-error";
import type { Me } from "@/lib/types";

const LINKS = [
  { href: "/admin", label: "ภาพรวม" },
  { href: "/admin/users", label: "ผู้ใช้" },
  { href: "/admin/rooms", label: "ห้องเรียน" },
];

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
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <header className="space-y-3 border-b pb-4">
        <div>
          <p className="text-sm text-gray-500">ClassPing</p>
          <h1 className="text-2xl font-semibold">ระบบผู้ดูแล</h1>
        </div>
        <nav aria-label="เมนูผู้ดูแล" className="flex flex-wrap gap-2">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </header>
      {children}
    </main>
  );
}
