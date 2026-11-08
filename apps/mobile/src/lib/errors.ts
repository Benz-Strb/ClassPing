const RATE_LIMITED_TEXT = 'ส่งคำขอถี่เกินไป รอสักครู่แล้วลองใหม่';

// ข้อความตอนอ่านหลักฐานลาไม่สำเร็จ
export function previewErrorMessage(e: unknown) {
  const code = (e as { code?: string } | null)?.code;
  const message = e instanceof Error ? e.message : '';
  if (code === 'RATE_LIMITED') return message || RATE_LIMITED_TEXT;
  return `${message || 'อ่านหลักฐานไม่สำเร็จ'} — กรอกเหตุผลและส่งให้อาจารย์ตรวจเองได้`;
}

export const defaultErrorText = (status: number) =>
  status === 429 ? RATE_LIMITED_TEXT : 'เรียกระบบไม่สำเร็จ';
