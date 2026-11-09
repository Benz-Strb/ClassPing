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
const clean = (text: string) => text.replace(/^[\s:#*|.\-–]+|[\s#*|.]+$/g, '').trim();

function readDate(text: string): string {
  const value = digits(text).trim().replace(/^(?:วันที่|วัน|พ\.ศ\.|ค\.ศ\.)\s*/, '');
  let day: number, month: number, year: number;
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?!\d)/.exec(value);
  if (iso) return date.safeParse(iso[0]).success ? iso[0] : '';
  const numeric = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?!\d)/.exec(value);
  const thai = /^(\d{1,2})\s+([^\s]+)\s+(?:พ\.ศ\.\s*|ค\.ศ\.\s*)?(\d{4})(?!\d)/.exec(value);
  if (numeric) [, day, month, year] = numeric.map(Number);
  else if (thai) {
    day = Number(thai[1]); year = Number(thai[3]);
    month = months.indexOf(thai[2]) + 1 || shortMonths.indexOf(thai[2]) + 1;
  } else return '';
  if (year >= 2400) year -= 543;
  const result = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return date.safeParse(result).success ? result : '';
}

export function extractLeaveDraft(text: string) {
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
  const documentLine = lines.find(line => /^(?:วันที่(?:ออกเอกสาร|ออกใบรับรอง|ตรวจ)?|Date)\s*[:：]?\s*/i.test(line));
  const documentDate = documentLine ? readDate(documentLine.replace(/^(?:วันที่(?:ออกเอกสาร|ออกใบรับรอง|ตรวจ)?|Date)\s*[:：]?\s*/i, '')) : '';
  const range = lines.join(' ').match(/(?:ตั้งแต่วันที่|ตั้งแต่|วันที่ลา|วันเริ่ม(?:ต้น)?(?:ลา)?)\s*[:：]?\s*(.+?)(?=\s*(?:ถึงวันที่|จนถึงวันที่|ถึง|จนถึง)|$)/);
  const end = lines.join(' ').match(/(?:ถึงวันที่|จนถึงวันที่|วันสิ้นสุด(?:ลา)?)\s*[:：]?\s*(.+)/);
  const leaveStartDate = range ? readDate(range[1]) : '';
  const parsedEnd = end ? readDate(end[1]) : '';
  const leaveEndDate = leaveStartDate && parsedEnd >= leaveStartDate ? parsedEnd : '';
  const documentDetails = { facility, documentDate, leaveStartDate, leaveEndDate };
  const missingFields = [!reason && 'reason', ...Object.entries(documentDetails).filter(([, value]) => !value).map(([key]) => key)].filter(Boolean);
  return { reason, documentDetails, missingFields };
}
