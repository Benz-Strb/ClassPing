// ป้ายบอกว่าเป็นคาบสอบ ใช้ในรายการคาบ
export function ExamBadge({ title }: { title: string | null }) {
  return (
    <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-800">
      สอบ{title ? ` · ${title}` : ""}
    </span>
  );
}
