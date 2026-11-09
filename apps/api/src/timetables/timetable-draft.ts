import { z } from 'zod';

export const draftRowSchema = z.object({
  courseCode: z.string().trim().max(30),
  courseName: z.string().trim().max(200).default(''),
  section: z.string().trim().max(30).default(''),
  teacherName: z.string().trim().max(200).default(''),
  weekday: z.number().int().min(0).max(6).nullable(),
  startTime: z.string().max(5),
  endTime: z.string().max(5),
  roomName: z.string().trim().max(100).default(''),
});
export const importSchema = z.object({
  rows: z.array(draftRowSchema).min(1).max(100),
});
export type TimetableRow = z.infer<typeof draftRowSchema>;
export const normalizeCode = (v: string) =>
  v.normalize('NFKC').replace(/\s/g, '').toUpperCase();
export const normalizeName = (v: string) =>
  v
    .normalize('NFKC')
    .toLowerCase()
    .replace(
      /^(?:(?:ผู้ช่วยศาสตราจารย์|รองศาสตราจารย์|ศาสตราจารย์|อาจารย์|ผศ\.?|รศ\.?|ศ\.|ดร\.?|อ\.|prof\.?|assoc\.?|asst\.?|dr\.?|mr\.?|mrs\.?|ms\.?)[\s.]*)+/iu,
      '',
    )
    .replace(/[\s.]+/g, '');
export const normalizeSection = (v: string) =>
  /^\d+$/.test(v.trim()) ? String(Number(v)) : normalizeCode(v);
const DAYS = [
  ['อาทิตย์', 'อา.', 'sun', 'sunday'],
  ['จันทร์', 'จ.', 'mon', 'monday'],
  ['อังคาร', 'อ.', 'tue', 'tuesday'],
  ['พุธ', 'พ.', 'wed', 'wednesday'],
  ['พฤหัสบดี', 'พฤหัส', 'พฤ.', 'thu', 'thursday'],
  ['ศุกร์', 'ศ.', 'fri', 'friday'],
  ['เสาร์', 'ส.', 'sat', 'saturday'],
];
export function readWeekday(value: string): number | null {
  const v = value.trim().toLowerCase().replace(/^วัน/, '');
  const index = DAYS.findIndex((names) =>
    names.some((name) => v === name || v.startsWith(`${name} `)),
  );
  return index < 0 ? null : index;
}
const timePattern =
  /\b([01]?\d|2[0-3])[:.]([0-5]\d)\s*[-–—ถึง]+\s*([01]?\d|2[0-3])[:.]([0-5]\d)\b/;
const codePattern = /\b[A-Z]{2,6}\s*\d{2,4}(?:-[A-Z0-9]+)?\b/i;
const timePair = (value: string) => {
  const match = value.match(timePattern);
  return match
    ? [
        `${match[1].padStart(2, '0')}:${match[2]}`,
        `${match[3].padStart(2, '0')}:${match[4]}`,
      ]
    : ['', ''];
};
const clean = (v: string) =>
  v
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
const headers: Record<string, string[]> = {
  courseCode: ['รหัสวิชา', 'รหัสรายวิชา', 'coursecode', 'subjectcode', 'code'],
  courseName: [
    'ชื่อวิชา',
    'ชื่อรายวิชา',
    'coursename',
    'subjectname',
    'subject',
  ],
  section: ['กลุ่ม', 'กลุ่มเรียน', 'section', 'sec'],
  teacherName: [
    'อาจารย์',
    'ผู้สอน',
    'อาจารย์ผู้สอน',
    'teacher',
    'instructor',
    'lecturer',
  ],
  weekday: ['วัน', 'วันเรียน', 'day', 'weekday'],
  startTime: ['เวลาเริ่ม', 'start', 'starttime'],
  endTime: ['เวลาสิ้นสุด', 'เวลาจบ', 'end', 'endtime'],
  time: ['เวลา', 'เวลาเรียน', 'time'],
  roomName: ['ห้อง', 'ห้องเรียน', 'room'],
};
const headerKey = (v: string) => {
  const label = v.toLowerCase().replace(/[\s.():/]/g, '');
  return Object.keys(headers).find((key) =>
    headers[key].some(
      (alias) =>
        label === alias ||
        label.startsWith(`${alias}course`) ||
        label.startsWith(`${alias}subject`),
    ),
  );
};

export function extractTimetable(lines: { text: string }[]) {
  const ocrText = lines
    .map((line) => line.text)
    .join('\n')
    .slice(0, 200_000);
  const source = ocrText
    .replace(/<tr\b[^>]*>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/(?:td|th)>/gi, '|')
    .replace(/<br\s*\/?\s*>/gi, ' ');
  const rows: TimetableRow[] = [];
  let columns: (string | undefined)[] = [];
  let pending = '';
  function parse(value: string) {
    const cells = value.split(/\||\t/).map(clean);
    if (!cells[0]) cells.shift();
    if (!cells.at(-1)) cells.pop();
    const mapped = cells.map(headerKey);
    if (mapped.filter(Boolean).length >= 2 && mapped.includes('courseCode')) {
      columns = mapped;
      return;
    }
    const line = clean(value);
    const code = line.match(codePattern)?.[0];
    if (!code) return;
    const field = (name: string) =>
      columns.length === cells.length
        ? (cells[columns.indexOf(name)] ?? '')
        : '';
    const [startTime, endTime] = timePair(field('time') || line);
    const dayCell = cells.find((cell) => readWeekday(cell) !== null);
    const dayWord = line.match(
      /(?:วัน)?(?:จันทร์|อังคาร|พุธ|พฤหัสบดี|พฤหัส|ศุกร์|เสาร์|อาทิตย์)/u,
    )?.[0];
    rows.push({
      courseCode: normalizeCode(field('courseCode') || code),
      courseName: field('courseName'),
      section:
        field('section') ||
        line.match(
          /(?:กลุ่ม(?:เรียน)?|section|sec\.?)\s*[:.]?\s*([A-Z0-9-]+)/i,
        )?.[1] ||
        '',
      teacherName:
        field('teacherName') ||
        line
          .match(
            /(?:อาจารย์|อ\.|ผศ\.|รศ\.|ดร\.|ผู้สอน\s*:?)\s*([^|\d]+?)(?=\s+(?:วัน|ห้อง)|\||$)/u,
          )?.[1]
          ?.trim() ||
        '',
      weekday: readWeekday(field('weekday') || dayCell || dayWord || ''),
      startTime: field('startTime').replace('.', ':') || startTime,
      endTime: field('endTime').replace('.', ':') || endTime,
      roomName:
        field('roomName') ||
        line.match(/(?:ห้อง(?:เรียน)?|room)\s*:?\s*([\p{L}\d./-]+)/iu)?.[1] ||
        '',
    });
  }
  for (const line of source.split(/\r?\n/).filter((v) => v.trim())) {
    if (/^[\s|:–-]+$/.test(line)) continue;
    if (
      line.match(codePattern) ||
      line.split(/\||\t/).filter((v) => headerKey(clean(v))).length >= 2
    ) {
      if (pending) parse(pending);
      pending = line;
    } else if (pending) pending += ` ${line}`;
  }
  if (pending) parse(pending);
  const unique = [
    ...new Map(rows.map((row) => [JSON.stringify(row), row])).values(),
  ].slice(0, 100);
  return {
    rows: unique,
    ocrText,
    warnings: unique.length
      ? ['ตรวจรหัสวิชา กลุ่ม อาจารย์ วัน เวลา และห้องให้ตรงกับเอกสารก่อนยืนยัน']
      : ['ยังแยกตารางจากเอกสารไม่ได้ กรุณาเพิ่มแถวและกรอกข้อมูลจากต้นฉบับ'],
  };
}
