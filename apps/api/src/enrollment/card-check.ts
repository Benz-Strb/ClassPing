import { bangkokDate } from '../sessions/plan-day.js';

export interface CardLine {
  text: string;
  score: number;
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

// บรรทัดที่ใช้ตอนวัดจริงได้ ≥ 0.978 ตัวหนังสือไทยที่อ่านเพี้ยนได้ 0.59-0.90
const MIN_LINE_SCORE = 0.9;
const MARKER = 'OFFICIAL STUDENT VIRTUAL ID';
const CODE = /\b\d{8}\b/g;
const DATE = /(\d{2})-(\d{2})-(\d{4})/;
// วันที่ พ.ศ. ที่ OCR อ่านขีดหาย (เช่น 27052566) ไม่ใช่รหัสนักศึกษา รหัสขึ้นต้นด้วยปีเข้า (6x) เป็นวันที่ไม่ได้
const DASHLESS_DATE = /^(0[1-9]|[12]\d|3[01])(0[1-9]|1[0-2])25\d\d$/;
// ปีบนบัตรเป็น พ.ศ.
const BE_OFFSET = 543;

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
  const sure = lines.filter((l) => l.score >= MIN_LINE_SCORE).map((l) => l.text.trim());
  if (!sure.some((t) => t.toUpperCase().replace(/\s+/g, ' ').includes(MARKER))) return unreadable;

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
