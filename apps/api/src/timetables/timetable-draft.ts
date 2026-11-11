import { z } from 'zod';
import type { TimetableIdentity } from './timetable-identity.js';

export function readTimetableIdentity(text: string): TimetableIdentity | null {
  const normalized = text.replace(/<[^>]+>/g, ' ').replace(/[|\t]/g, ' ');
  const labeled = [...normalized.matchAll(/เลขทะเบียน\s*[:：]?\s*(\d{7,12})\s+([^\r\n]+)/gu)];
  const detached = /เลขทะเบียน/u.test(normalized)
    ? [...normalized.matchAll(/^\s*(\d{7,12})\s+((?:นาย|นางสาว|นาง|น\.ส\.)[^\r\n]+)/gmu)] : [];
  const found = [...labeled, ...detached];
  if (new Set(found.map(match => `${match[1]}:${match[2].normalize('NFKC').replace(/\s+/g, '')}`)).size > 1) return null;
  const match = found[0];
  if (!match) return null;
  const fullName = match[2].split(/\s+(?:หลักสูตร|ประเภท|ระดับการศึกษา|Track)\s*[:：]/u)[0].trim();
  return fullName ? { studentId: match[1], fullName } : null;
}


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
const codePattern = /\b(?:[A-Z]{2,6}\s*\d{2,4}(?:-[A-Z0-9]+)?|\d{6,8}(?:-\d{1,3})?)\b/i;
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
  time: ['เวลา', 'เวลาเรียน', 'time', 'ห้องเรียนวันเวลาเรียน'],
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

const fieldLabels = /(?:^|[\s|])(?:รหัสรายวิชา|รหัสวิชา|ชื่อรายวิชา|ชื่อวิชา|กลุ่มเรียน|กลุ่ม|อาจารย์ผู้สอน|ผู้สอน|วันเรียน|วัน|เวลาเรียน|เวลาเริ่ม|เวลาสิ้นสุด|เวลาจบ|เวลา|ห้องเรียน|ห้อง)\s*[:：]?\s*/gu;
function labeledFields(value: string): Record<string, string> {
  const labels = [...value.matchAll(fieldLabels)].filter((match, index, all) =>
    index === 0 || headerKey(match[0].trim().replace(/[:：]$/, '').trim()) !==
      headerKey(all[index - 1][0].trim().replace(/[:：]$/, '').trim()),
  );
  return Object.fromEntries(labels.flatMap((match, index) => {
    const key = headerKey(match[0].trim().replace(/[:：]$/, '').trim());
    const content = value.slice(match.index! + match[0].length, labels[index + 1]?.index).trim();
    return key && content ? [[key, content]] : [];
  }));
}

const meetingPattern = /(?:วัน)?(พฤหัสบดี|พฤหัส|พฤ\.|จันทร์|อังคาร|อาทิตย์|ศุกร์|เสาร์|พุธ|จ\.|อ\.|พ\.|ศ\.|ส\.|อา\.)\s*([01]?\d|2[0-3])[:.]([0-5]\d)\s*[-–—]\s*([01]?\d|2[0-3])[:.]([0-5]\d)/gu;

function meetings(value: string) {
  const matches = [...value.matchAll(meetingPattern)];
  return matches.map((match, index) => {
    const detail = value.slice(match.index! + match[0].length, matches[index + 1]?.index);
    return {
      weekday: readWeekday(match[1]),
      startTime: `${match[2].padStart(2, '0')}:${match[3]}`,
      endTime: `${match[4].padStart(2, '0')}:${match[5]}`,
      roomName: /\(?ออนไลน์\)?/u.test(detail) ? 'ออนไลน์' :
        detail.match(/ห้อง(?:เรียน)?\s*:?\s*([\p{L}\d./-]+)/u)?.[1] ?? '',
    };
  });
}

function registrationRows(text: string): TimetableRow[] | null {
  if (!/ใบรายงานการลงทะเบียน/u.test(text)) return null;
  const blocks = [...text.matchAll(/^\s*([A-Z]{2,6}\d{2,4})\s+([\s\S]*?)(?=^\s*[A-Z]{2,6}\d{2,4}\s+|รายวิชาที่ลงทะเบียนทั้งหมด|$(?![\s\S]))/gm)];
  const rows: TimetableRow[] = [];
  for (const block of blocks) {
    const details = block[2].match(/^([\s\S]*?)\s+(\d{1,3})\s+\d+(?:\.\d+)?\s+(?:ภาษาไทย|ภาษาอังกฤษ)\s+([\s\S]*)$/u);
    if (!details) continue;
    const firstMeeting = [...details[3].matchAll(meetingPattern)][0];
    const teacherName = clean(details[3].slice(0, firstMeeting?.index));
    const base = {
      courseCode: block[1],
      courseName: clean(details[1].replace(/\r?\n\s*/g, '')),
      section: details[2], teacherName,
    };
    const slots = meetings(details[3]);
    if (slots.length) rows.push(...slots.map(slot => ({ ...base, ...slot })));
    else rows.push({ ...base, weekday: null, startTime: '', endTime: '', roomName: '' });
  }
  return rows.length ? rows : null;
}

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
    const labeled = labeledFields(line);
    const field = (name: string) =>
      (columns.length === cells.length
        ? (cells[columns.indexOf(name)] ?? '')
        : '') || labeled[name] || '';
    const [startTime, endTime] = timePair(field('time') || line);
    const dayCell = cells.find((cell) => readWeekday(cell) !== null);
    const dayWord = line.match(
      /(?:วัน)?(?:จันทร์|อังคาร|พุธ|พฤหัสบดี|พฤหัส|ศุกร์|เสาร์|อาทิตย์)/u,
    )?.[0];
    const row: TimetableRow = {
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
    };
    const slots = meetings(field('time') || field('roomName') || line);
    rows.push(...(slots.length ? slots.map(slot => ({ ...row, ...slot, roomName: slot.roomName || row.roomName })) : [row]));
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
    ...new Map((registrationRows(ocrText) ?? rows).map((row) => [JSON.stringify(row), row])).values(),
  ].slice(0, 100);
  return {
    identity: readTimetableIdentity(ocrText),
    rows: unique,
    ocrText,
    warnings: unique.length
      ? ['ตรวจรหัสวิชา ชื่อวิชา กลุ่มเรียน ห้องเรียน วัน เวลาเรียน และอาจารย์ผู้สอนให้ตรงกับเอกสารก่อนยืนยัน']
      : ['ยังแยกตารางจากเอกสารไม่ได้ กรุณาเพิ่มแถวและกรอกข้อมูลจากต้นฉบับ'],
  };
}
