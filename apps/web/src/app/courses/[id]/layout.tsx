import { Suspense } from "react";
import { CourseHeader } from "@/components/course-header";

// หัวข้อวิชา + แท็บ ใช้ร่วมทุกหน้าของวิชา
// useParams ใน route ที่ id ไม่รู้ตอน build ต้องอยู่ใน Suspense (cacheComponents)
export default function CourseLayout({ children }: LayoutProps<"/courses/[id]">) {
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <Suspense fallback={<p>กำลังโหลด...</p>}>
        <CourseHeader />
      </Suspense>
      <Suspense fallback={<p>กำลังโหลด...</p>}>{children}</Suspense>
    </main>
  );
}
