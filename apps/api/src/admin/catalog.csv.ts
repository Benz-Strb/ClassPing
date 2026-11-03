import { AppError } from '../common/app-error.js';

export const MAX_CSV_BYTES = 200_000;
export const MAX_IMPORT_ROWS = 500;

// Read RFC-style quoting without silently accepting broken files.
export function parseCsv(source: string): string[][] {
  const invalid = (message: string): never => { throw new AppError(400, 'INVALID_CSV', message); };
  if (Buffer.byteLength(source, 'utf8') > MAX_CSV_BYTES) invalid('ไฟล์ CSV ต้องไม่เกิน 200 KB');
  const text = source.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let state: 'start' | 'plain' | 'quoted' | 'closed' = 'start';
  const finishCell = () => { row.push(cell); cell = ''; state = 'start'; };
  const finishRow = () => {
    finishCell();
    if (row.some((value) => value.trim() !== '')) rows.push(row);
    row = [];
    if (rows.length > MAX_IMPORT_ROWS + 1) invalid('นำเข้าได้ไม่เกิน 500 รายการต่อครั้ง');
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (state === 'quoted') {
      if (char === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else state = 'closed';
      } else cell += char;
      continue;
    }
    if (char === ',') { finishCell(); continue; }
    if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      finishRow();
      continue;
    }
    if (state === 'closed') invalid(`CSV แถว ${rows.length + 1}: มีอักขระหลังเครื่องหมายคำพูด`);
    if (char === '"') {
      if (state !== 'start') invalid(`CSV แถว ${rows.length + 1}: เครื่องหมายคำพูดไม่ถูกต้อง`);
      state = 'quoted';
    } else { cell += char; state = 'plain'; }
  }
  if (state === 'quoted') invalid('CSV มีเครื่องหมายคำพูดที่ยังไม่ปิด');
  if (cell !== '' || row.length || state === 'closed') finishRow();
  return rows;
}
