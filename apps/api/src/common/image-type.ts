// ดูจากไบต์แรกของไฟล์ ไม่เชื่อ Content-Type ที่ส่งมาอย่างเดียว
const MAGIC: Record<string, number[]> = {
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
};

export function looksLike(mime: string, bytes: Buffer): boolean {
  const magic = MAGIC[mime];
  return !!magic && bytes.length >= magic.length && magic.every((b, i) => bytes[i] === b);
}
