import { Suspense } from "react";
import type { Metadata } from "next";
import { Notifications } from "@/components/notifications";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClassPing",
  description: "ระบบเช็คชื่อเข้าเรียนด้วยใบหน้า",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th">
      <body>
        <Notifications />
        <a href="#main-content" className="skip-link">ข้ามไปเนื้อหา</a>
        <Suspense fallback={<p role="status" className="p-6">กำลังโหลด...</p>}>
          {children}
        </Suspense>
      </body>
    </html>
  );
}
