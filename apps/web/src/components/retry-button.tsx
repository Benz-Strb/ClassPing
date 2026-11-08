"use client";

// โหลดข้อมูลไม่สำเร็จ แสดงปุ่มแทนข้อความกำลังโหลด กดแล้วโหลดหน้าใหม่
export function RetryButton() {
  return (
    <button onClick={() => window.location.reload()} className="rounded-lg border px-4 py-2">
      ลองใหม่
    </button>
  );
}
