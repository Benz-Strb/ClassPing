import { z } from 'zod';

const date = z.string().refine(value => !value || (/^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number(value.slice(0, 4)) >= 1900 && Number(value.slice(0, 4)) <= 2200 &&
  Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value), 'วันที่ต้องเป็น YYYY-MM-DD และมีอยู่จริง');
export const documentDetailsSchema = z.object({
  facility: z.string().trim().max(200).default(''),
  documentDate: date.default(''),
  leaveStartDate: date.default(''),
  leaveEndDate: date.default(''),
}).strict().refine(value => !value.leaveEndDate || (value.leaveStartDate && value.leaveEndDate >= value.leaveStartDate),
  'วันสิ้นสุดต้องมีวันเริ่มต้นและไม่อยู่ก่อนวันเริ่มต้น');
export type DocumentDetails = z.infer<typeof documentDetailsSchema>;

const months = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const shortMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const digits = (text: string) => text.replace(/[๐-๙]/g, c => String('๐๑๒๓๔๕๖๗๘๙'.indexOf(c)));
// OCR มักทำวรรณยุกต์หล่น เช่น ตั้งแต่ เป็น ตั้งแต จึงเทียบวันที่และป้ายแบบไม่มีวรรณยุกต์
const plain = (text: string) => text.replace(/[\u0E48-\u0E4B]/g, '');
const clean = (text: string) => text.replace(/^[\s:#*|.\-–]+|[\s#*|.]+$/g, '').trim();

const toIso = (day: number, month: number, year: number) => {
  // ปีสองหลักในเอกสารไทยเป็น พ.ศ. เช่น 69 คือ 2569
  if (year < 100) year += 2500;
  if (year >= 2400) year -= 543;
  const result = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return date.safeParse(result).success ? result : '';
};
function distance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) {
      next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    row = next;
  }
  return row[b.length];
}

// วันอ้างอิงตอนเลือกเดือนที่กำกวม ตั้งใหม่ทุกครั้งที่เรียก extractLeaveDraft
let today = new Date();
const undotted = (text: string) => text.replace(/[.\s]/g, '');

// OCR มักอ่านชื่อเดือนตกหรือเพี้ยน 1-2 ตัว เช่น ตุลาคม เป็น ตุลาม หรือทำจุดของเดือนย่อหาย เช่น ต.ค
// ใช้เดือนที่ตรงที่สุด ผิดได้ไม่เกินหนึ่งในสามของชื่อ ถ้าตรงเท่ากันหลายเดือน ใช้เดือนที่ทำให้วันที่ใกล้วันนี้ที่สุด
function monthOf(name: string, day: number, year: number): number {
  const exact = months.indexOf(name) + 1 || shortMonths.map(undotted).indexOf(undotted(name)) + 1;
  if (exact) return exact;
  const candidates = months
    .map((month, index) => ({ month: index + 1, score: distance(plain(name), plain(month)), allowed: Math.floor(month.length / 3) }))
    .filter(({ month, score, allowed }) => score <= allowed && toIso(day, month, year));
  const best = Math.min(...candidates.map(({ score }) => score));
  const tied = candidates.filter(({ score }) => score === best);
  if (tied.length <= 1) return tied[0]?.month ?? 0;
  const gap = (month: number) => Math.abs(Date.parse(`${toIso(day, month, year)}T00:00:00Z`) - today.getTime());
  return tied.reduce((best, next) => (gap(next.month) < gap(best.month) ? next : best)).month;
}

// อ่านวันที่ที่ขึ้นต้นข้อความ คืนวันที่และข้อความที่เหลือหลังวันที่
function matchDate(text: string): { value: string; rest: string } {
  const value = plain(digits(text)).trim().replace(/^(?:วันที|วัน|พ\.ศ\.|ค\.ศ\.)\s*/, '');
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?!\d)/.exec(value);
  if (iso) return { value: date.safeParse(iso[0]).success ? iso[0] : '', rest: value.slice(iso[0].length) };
  const numeric = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4}|\d{2})(?!\d)/.exec(value);
  if (numeric) return { value: toIso(Number(numeric[1]), Number(numeric[2]), Number(numeric[3])), rest: value.slice(numeric[0].length) };
  const thai = /^(\d{1,2})\s+([^\s]+)\s+(?:พ\.ศ\.\s*|ค\.ศ\.\s*)?(\d{4}|\d{2})(?!\d)/.exec(value);
  if (thai) return { value: toIso(Number(thai[1]), monthOf(thai[2], Number(thai[1]), Number(thai[3])), Number(thai[3])), rest: value.slice(thai[0].length) };
  return { value: '', rest: value };
}
const readDate = (text: string) => matchDate(text).value;

// ช่วงลา เช่น "29 ตุลาคม 2569 ถึง 30 ตุลาคม 2569" หรือ "29-30 ตุลาคม 2569"
function readPeriod(text: string): [string, string] {
  const value = plain(digits(text)).trim().replace(/^(?:วันที|วัน)\s*/, '');
  const days = /^(\d{1,2})\s*[-–]\s*(\d{1,2})\s+([^\s]+)\s+(?:พ\.ศ\.\s*|ค\.ศ\.\s*)?(\d{4}|\d{2})(?!\d)/.exec(value);
  if (days) {
    const year = Number(days[4]);
    const month = monthOf(days[3], Number(days[1]), year);
    return [toIso(Number(days[1]), month, year), toIso(Number(days[2]), month, year)];
  }
  const start = matchDate(value);
  const joiner = /^\s*(?:(?:จน)?ถึง\s*(?:วันที)?|[-–])\s*[:：]?\s*/.exec(start.rest);
  return [start.value, start.value && joiner ? readEnd(start.rest.slice(joiner[0].length), start.value) : ''];
}

// วันสิ้นสุดที่ OCR อ่านเดือนหรือปีเพี้ยน ใช้เดือนและปีของวันเริ่ม ถ้าไม่ก่อนวันเริ่ม
function readEnd(text: string, start: string): string {
  // ปีห่างจากวันเริ่มเกิน 1 ปี ถือว่าอ่านเพี้ยน เช่น 2569 เป็น 2669
  const exact = readDate(text);
  if (exact && Math.abs(Number(exact.slice(0, 4)) - Number(start.slice(0, 4))) <= 1) return exact;
  const day = /^(\d{1,2})(?!\d)/.exec(plain(digits(text)).trim().replace(/^(?:วันที|วัน)\s*/, ''));
  if (!day) return '';
  const guess = `${start.slice(0, 8)}${day[1].padStart(2, '0')}`;
  return date.safeParse(guess).success && guess >= start ? guess : '';
}

export function extractLeaveDraft(text: string, now = new Date()) {
  today = now;
  const lines = text.split('\n').map(clean).filter(Boolean);
  const reasonLabel = /^(?:เหตุผล(?:การลา)?|สาเหตุ|เนื่องจาก|เนื่องด้วย|ขอลาเนื่องจาก|การวินิจฉัย(?:โรค)?|วินิจฉัย(?:โรค)?(?:ว่า)?|อาการ(?:สำคัญ)?(?:ที่พบ)?|โรค|ป่วยเป็น|ป่วยด้วย|มีความจำเป็นต้อง|ตรวจพบ(?:ว่า)?|พบ(?:ว่า)?|Diagnosis|Dx|Symptoms|Reason)\s*[:：\-–—.]?\s*(.*)$/i;
  let reason = '';
  for (let i = 0; i < lines.length; i++) {
    const match = reasonLabel.exec(lines[i]);
    if (!match) continue;
    const next = match[1] || lines[i + 1] || '';
    if (!/^(?:ชื่อ|รหัส|วันที่|แพทย์|โรงพยาบาล|คลินิก|ลงชื่อ|Date|Doctor|Hospital|Name)/i.test(next)) reason = clean(next).slice(0, 1000);
    if (reason) break;
  }
  if (!reason) reason = lines.find(line => /(?:สมควรให้|เห็นควรให้|แนะนำให้|ให้)(?:หยุดพักรักษาตัว|พักรักษาตัว|หยุดเรียน|พักฟื้น|หยุดงาน)/.test(line))?.slice(0, 1000) ?? '';
  const facilityLine = lines.find(line => /^(?:บริษัท\s*)?(?:(?:ชื่อ)?สถานพยาบาล\s*[:：]?\s*)?(?:โรงพยาบาล|คลินิก|รพ\.)/.test(line));
  const facility = facilityLine ? clean(facilityLine.replace(/^(?:บริษัท\s*)?(?:(?:ชื่อ)?สถานพยาบาล\s*[:：]?\s*)?/, '')).slice(0, 200) : '';
  const dateLabel = /^(?:วันที(?:ออกเอกสาร|ออกใบรับรอง|ตรวจ)?|Date)\s*[:：]?\s*/i;
  const plainLines = lines.map(plain);
  const documentIndex = plainLines.findIndex(line => dateLabel.test(line));
  // ป้ายวันที่อาจอยู่คนละบรรทัดกับค่า
  const documentValue = documentIndex < 0 ? '' : plainLines[documentIndex].replace(dateLabel, '') || plainLines[documentIndex + 1] || '';
  const documentDate = readDate(documentValue);
  const joined = plainLines.join(' ');
  const range = joined.match(/(?:ตังแตวันที|ตังแต|วันทีลา|วันเริม(?:ตน)?(?:ลา)?)\s*[:：]?\s*(.+)/);
  const [leaveStartDate, periodEnd] = range ? readPeriod(range[1]) : ['', ''];
  // ถ้าไม่ได้เขียนต่อจากวันเริ่ม ให้หาป้ายวันสิ้นสุดแยก
  const end = joined.match(/(?:(?:จน)?ถึง\s*วันที|วันสินสุด(?:ลา)?)\s*[:：]?\s*(.+)/);
  const parsedEnd = periodEnd || (end ? readDate(end[1]) : '');
  const leaveEndDate = leaveStartDate && parsedEnd >= leaveStartDate ? parsedEnd : '';
  const documentDetails = { facility, documentDate, leaveStartDate, leaveEndDate };
  const missingFields = [!reason && 'reason', ...Object.entries(documentDetails).filter(([, value]) => !value).map(([key]) => key)].filter(Boolean);
  return { reason, documentDetails, missingFields };
}
