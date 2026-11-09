"use client";

import Link from "next/link";
import { useWebUser } from "@/components/web-access";
import { TodayAgenda } from "@/components/today-agenda";

export default function Home() {
  const me = useWebUser();

  if (me) return (
    <main className="space-y-8">
      <TodayAgenda />
    </main>
  );

  return (
    <main className="welcome-layout">
        <section className="work-surface welcome-panel">
          <h1>ClassPing</h1>
          <p className="tool-note mt-3 mb-8">ระบบจัดการรายวิชาและการเข้าเรียนด้วยใบหน้า สำหรับผู้ดูแลระบบและอาจารย์</p>
          <Link href="/login" className="welcome-action">เข้าสู่ระบบด้วยบัญชีมหาวิทยาลัย</Link>
        </section>
    </main>
  );
}
