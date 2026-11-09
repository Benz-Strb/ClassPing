"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { handleApiError } from "@/lib/auth-error";
import type { Me } from "@/lib/types";

const LINKS = [
  { href: "/admin", label: "ภาพรวม" },
  { href: "/admin/users", label: "ผู้ใช้" },
  { href: "/admin/rooms", label: "ห้องเรียน" },
  { href: "/admin/cameras", label: "กล้องประจำห้อง" },
  { href: "/admin/video-views", label: "ประวัติการดูกล้อง" },
  { href: "/admin/courses", label: "รายวิชาและตารางเรียน" },
  { href: "/admin/reference", label: "ข้อมูลกลาง" },
  { href: "/admin/knowledge", label: "แหล่งความรู้" },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
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
    <main className="admin-workspace mx-auto space-y-8 p-4 sm:p-6">
      <header className="admin-heading space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">ระบบผู้ดูแล</h1>
        </div>
        <nav aria-label="เมนูผู้ดูแล" className="admin-tabs">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={pathname === link.href ? "page" : undefined}
              className="admin-tab"
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
