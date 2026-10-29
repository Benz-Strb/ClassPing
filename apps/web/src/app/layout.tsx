import type { Metadata } from "next";
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
        <MainNavigation />
        {children}
      </body>
    </html>
  );
}
