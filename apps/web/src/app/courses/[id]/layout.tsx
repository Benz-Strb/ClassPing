import { Suspense } from "react";
import { CourseHeader } from "@/components/course-header";

// useParams ต้องอยู่ใน Suspense (cacheComponents)
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
