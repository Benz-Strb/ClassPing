import { redirect } from "next/navigation";

// ดูย้อนหลังย้ายไปอยู่ในตัวเล่นเดียวกับหน้าดูสดแล้ว ลิงก์เก่ายังใช้ได้
export default async function RecordingPage({ params }: PageProps<"/live/[sessionId]/recording">) {
  const { sessionId } = await params;
  redirect(`/live/${sessionId}`);
}
