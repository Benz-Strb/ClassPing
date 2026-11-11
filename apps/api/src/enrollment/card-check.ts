import { bangkokDate } from '../sessions/plan-day.js';

export interface CardLine {
  text: string;
  // Typhoon ไม่ส่งความมั่นใจมา (null) ใช้ทุกบรรทัด
  score: number | null;
}

export type CardCheck =
  | { ok: true }
  | {
      ok: false;
      code: 'CARD_UNREADABLE' | 'CARD_NOT_YOURS' | 'CARD_NOT_TODAY';
      message: string;
    };

// หน้าในบัตรเทียบหน้าสด ค่าชั่วคราวเท่ากับ MATCH_REVIEW_MIN
// (ArcFace จับคนผิด 1 ใน 10,000 ที่ 0.356, arXiv 2503.20108) บัตรจริงของเบนซ์ได้ 0.523
export const CARD_MATCH_MIN = 0.36;

// เผื่อตัวอ่านที่ส่งคะแนนมา บรรทัดที่ไม่มั่นใจไม่เอามาใช้
const MIN_LINE_SCORE = 0.9;
// ขีดยาวแบบต่าง ๆ ให้เป็น - ก่อนอ่านวันที่
const DASHES = /[\u2010-\u2015\u2212]/g;
const MARKER = 'OFFICIAL STUDENT VIRTUAL ID';
const CODE = /\b\d{8}\b/g;
const DATE = /(\d{2})-(\d{2})-(\d{4})/;
// วันที่ พ.ศ. ที่ OCR อ่านขีดหาย (เช่น 27052566) ไม่ใช่รหัสนักศึกษา รหัสขึ้นต้นด้วยปีเข้า (6x) เป็นวันที่ไม่ได้
const DASHLESS_DATE = /^(0[1-9]|[12]\d|3[01])(0[1-9]|1[0-2])25\d\d$/;
// ปีบนบัตรเป็น พ.ศ.
const BE_OFFSET = 543;

// Typhoon อาจคืนตารางเป็น HTML หรือ markdown เอาแท็กกับขีดตารางออกก่อน
function sureLines(lines: CardLine[]): string[] {
  return lines
    .filter((l) => l.score === null || l.score >= MIN_LINE_SCORE)
    .map((l) => l.text.replace(DASHES, '-').replace(/<[^>]*>/g, ' ').replace(/\|/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

const unreadable: CardCheck = {
  ok: false,
  code: 'CARD_UNREADABLE',
  message: 'อ่านบัตรไม่ออก ใช้ภาพหน้าจอบัตรนักศึกษาออนไลน์ทั้งใบ ไม่ต้องครอป',
};

// ตรวจข้อความจากภาพหน้าจอบัตรนักศึกษาออนไลน์ของ DPU: เป็นบัตรของเจ้าของบัญชี และเปิดบัตรวันนี้
export function checkCard(
  lines: CardLine[],
  expected: { studentCode: string; today: Date },
): CardCheck {
  const sure = sureLines(lines);
  // OCR อาจตัดบรรทัดนี้ตรงช่องว่าง (เช่น "... VIRTUAL" กับ "ID") ต่อบรรทัดที่ติดกันก่อนค้น
  if (!sure.join(' ').toUpperCase().replace(/\s+/g, ' ').includes(MARKER)) return unreadable;

  // บัตรมีวันที่สองที่ (วันสร้างภาพ วันออกบัตร) ถ้า OCR อ่านขีดหายจะกลายเป็นเลข 8 หลัก
  const codes = new Set(
    sure
      .filter((t) => !DATE.test(t) && !/generate/i.test(t))
      .flatMap((t) => t.match(CODE) ?? [])
      .filter((c) => !DASHLESS_DATE.test(c)),
  );
  if (!codes.size) return unreadable;
  if (codes.size > 1 || !codes.has(expected.studentCode)) {
    return { ok: false, code: 'CARD_NOT_YOURS', message: 'รหัสบนบัตรไม่ตรงกับบัญชีที่เข้าสู่ระบบ' };
  }

  // OCR อาจแยก "System Generate Date :" กับวันที่เป็นคนละบรรทัด
  const at = sure.findIndex((t) => /generate/i.test(t));
  const date = at < 0 ? null : (sure[at].match(DATE) ?? sure[at + 1]?.match(DATE));
  if (!date) return unreadable;
  const [, day, month, beYear] = date;
  const onCard = `${Number(beYear) - BE_OFFSET}-${month}-${day}`;
  if (onCard !== bangkokDate(expected.today)) {
    return {
      ok: false,
      code: 'CARD_NOT_TODAY',
      message: 'ต้องเป็นภาพบัตรของวันนี้ เปิดบัตรใหม่แล้วจับภาพหน้าจออีกครั้ง',
    };
  }
  return { ok: true };
}

export interface StudyInfo {
  // ชื่อ-สกุลภาษาไทยบนบัตร (ไม่มีคำนำหน้า)
  fullNameTh: string | null;
  faculty: string | null;
  major: string | null;
}

const FACULTY = /^(คณะ|วิทยาลัย|สถาบัน)/;
const THAI_WORDS = /^[\u0E00-\u0E7F]+( [\u0E00-\u0E7F]+)*$/;
// บรรทัดไทยล้วนที่ไม่ใช่ชื่อ เช่น "ปริญญาตรี กำลังศึกษาอยู่" ตอน OCR อ่านภาคเรียนหาย
const NOT_NAME = /ปริญญา|ศึกษา|คณะ|วิทยาลัย|สถาบัน|สาขา/;

// บัตรเขียนชื่อกับนามสกุลแยกบรรทัดใต้รหัส Typhoon อาจคืนรวมเป็นบรรทัดเดียวก็ได้
// โลโก้ DPU อยู่ข้างรหัส บางภาพ Typhoon อ่านโลโก้แทรกก่อนชื่อ จึงข้ามบรรทัดที่ไม่มีตัวไทยไปได้
function readThaiName(sure: string[], studentCode: string): string | null {
  const at = sure.findIndex((t) => t.includes(studentCode));
  if (at < 0) return null;
  const words: string[] = [];
  for (const line of sure.slice(at + 1, at + 6)) {
    if (!words.length && !/[\u0E00-\u0E7F]/.test(line)) continue;
    if (!THAI_WORDS.test(line) || NOT_NAME.test(line)) break;
    words.push(line);
  }
  const name = words.join(' ');
  return name.split(' ').length >= 2 ? name : null;
}

// อ่านไม่ได้ไม่ใช่เหตุให้ยืนยันบัตรไม่ผ่าน เก็บเป็นค่าว่างไว้
export function readStudyInfo(lines: CardLine[], studentCode = ''): StudyInfo {
  const sure = sureLines(lines);
  let faculty: string | null = null;
  let major: string | null = null;
  for (const line of sure) {
    // Typhoon อ่านคณะกับสาขาเป็นบรรทัดเดียว "วิทยาลัย... สาขาวิชา..."
    const split = line.indexOf('สาขา');
    const before = (split < 0 ? line : line.slice(0, split)).trim();
    if (!faculty && FACULTY.test(before)) faculty = before;
    if (!major && split >= 0 && (split === 0 || FACULTY.test(before))) major = line.slice(split).trim();
  }
  return { fullNameTh: studentCode ? readThaiName(sure, studentCode) : null, faculty, major };
}
