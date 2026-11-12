import { Suspense } from "react";
import { CourseHeader } from "@/components/course-header";

// useParams ต้องอยู่ใน Suspense (cacheComponents)
export default function CourseLayout({ children }: LayoutProps<"/courses/[id]">) {
  return (
    <main className="course-workspace fixed-workspace mx-auto p-6">
      <Suspense fallback={<p>กำลังโหลด...</p>}>
        <CourseHeader />
      </Suspense>
      <div className="workspace-body"><Suspense fallback={<p>กำลังโหลด...</p>}>{children}</Suspense></div>
    </main>
  );
}
