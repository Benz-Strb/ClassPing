"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { handleApiError } from "@/lib/auth-error";
import type { Me } from "@/lib/types";

const LINKS = [
  { href: "/teacher/transfers", label: "เทียบโอน" },
  { href: "/teacher/curricula", label: "หลักสูตร" },
];

// งานหลักสูตรและเทียบโอนเป็นของอาจารย์ บทบาทอื่นถูกส่งกลับ ส่วน API ตรวจสิทธิ์ซ้ำเอง
export default function TeacherLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [allowed, setAllowed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Me>("/me")
      .then((me) => {
        if (me.role !== "teacher") {
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
        <h1 className="text-2xl font-semibold">หลักสูตรและเทียบโอน</h1>
        <nav aria-label="เมนูหลักสูตรและเทียบโอน" className="admin-tabs">
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
      <div className="workspace-body">{children}</div>
    </main>
  );
}
