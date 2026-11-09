import { Suspense } from "react";
import type { Metadata } from "next";
import { WebAccess } from "@/components/web-access";
import { MainNavigation } from "@/components/main-navigation";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClassPing",
  description: "ระบบเช็คชื่อเข้าเรียนด้วยใบหน้า",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th">
      <body>
        <a href="#main-content" className="skip-link">ข้ามไปเนื้อหา</a>
        <Suspense fallback={<p role="status">กำลังตรวจสอบสิทธิ์...</p>}>
          <WebAccess>
          <div className="app-shell">
            <Suspense fallback={<nav aria-label="เมนูหลัก" className="app-navigation" aria-busy="true">ClassPing</nav>}>
              <MainNavigation />
            </Suspense>
            <div id="main-content" className="app-content" tabIndex={-1}>{children}</div>
          </div>
          </WebAccess>
        </Suspense>
      </body>
    </html>
  );
}
