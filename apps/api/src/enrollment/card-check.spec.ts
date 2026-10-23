import { checkCard, type CardLine } from './card-check.js';

// ข้อความที่ OCR อ่านได้จากบัตรจริงตอนวัด (ตัดชื่อภาษาไทยที่อ่านเพี้ยนออกบางส่วน)
const CARD: CardLine[] = [
  { text: 'DPU', score: 1 },
  { text: '66112106', score: 0.9999 },
  { text: 'DHURAKIJ PUNDIT', score: 0.999 },
  { text: 'rucn', score: 0.591 },
  { text: 'Ušryrynas rvnuna 1/2569', score: 0.769 },
  { text: 'System Generate Date : 23-10-2569', score: 0.978 },
  { text: 'OFFICIAL STUDENT VIRTUAL ID', score: 0.998 },
  { text: '5uənas : 27-05-2566', score: 0.904 },
];

const expect106 = { studentCode: '66112106', today: new Date('2026-10-23T03:00:00Z') };

const replace = (from: string, to: CardLine) => CARD.map((l) => (l.text === from ? to : l));
const without = (text: string) => CARD.filter((l) => l.text !== text);

describe('checkCard', () => {
  it('บัตรของเจ้าของบัญชี ออกวันนี้ ผ่าน', () => {
    expect(checkCard(CARD, expect106)).toEqual({ ok: true });
  });

  it('ไม่ใช่บัตรนักศึกษาออนไลน์ อ่านไม่ออก', () => {
    expect(checkCard(without('OFFICIAL STUDENT VIRTUAL ID'), expect106)).toMatchObject({
      ok: false,
      code: 'CARD_UNREADABLE',
    });
  });

  it('รหัสบนบัตรเป็นของคนอื่น', () => {
    const card = replace('66112106', { text: '66112126', score: 0.9999 });
    expect(checkCard(card, expect106)).toMatchObject({ ok: false, code: 'CARD_NOT_YOURS' });
  });

  it('OCR อ่านรหัสผิดหลักเดียวก็ไม่ผ่าน', () => {
    const card = replace('66112106', { text: '66112186', score: 0.95 });
    expect(checkCard(card, expect106)).toMatchObject({ ok: false, code: 'CARD_NOT_YOURS' });
  });

  it('มีรหัสสองชุดในภาพ ไม่ผ่านแม้ชุดหนึ่งตรง', () => {
    const card = [...CARD, { text: '66112126', score: 1 }];
    expect(checkCard(card, expect106)).toMatchObject({ ok: false, code: 'CARD_NOT_YOURS' });
  });

  it('ไม่เจอรหัสเลย อ่านไม่ออก', () => {
    expect(checkCard(without('66112106'), expect106)).toMatchObject({
      ok: false,
      code: 'CARD_UNREADABLE',
    });
  });

  it('บรรทัดที่ OCR ไม่มั่นใจไม่เอามาอ่านรหัส', () => {
    const card = replace('66112106', { text: '66112106', score: 0.6 });
    expect(checkCard(card, expect106)).toMatchObject({ ok: false, code: 'CARD_UNREADABLE' });
  });

  it('ภาพบัตรของเมื่อวาน ไม่ผ่าน', () => {
    const card = replace('System Generate Date : 23-10-2569', {
      text: 'System Generate Date : 22-10-2569',
      score: 0.98,
    });
    expect(checkCard(card, expect106)).toMatchObject({ ok: false, code: 'CARD_NOT_TODAY' });
  });

  it('ไม่มีวันที่สร้างบัตร อ่านไม่ออก', () => {
    expect(checkCard(without('System Generate Date : 23-10-2569'), expect106)).toMatchObject({
      ok: false,
      code: 'CARD_UNREADABLE',
    });
  });

  it('นับวันตามเวลาไทย ตีครึ่งวันที่ 24 ใช้บัตรวันที่ 24', () => {
    const card = replace('System Generate Date : 23-10-2569', {
      text: 'System Generate Date : 24-10-2569',
      score: 0.98,
    });
    const today = new Date('2026-10-23T17:30:00Z');
    expect(checkCard(card, { ...expect106, today })).toEqual({ ok: true });
  });

  it('วันที่บนบัตรไม่ถูกนับเป็นรหัส แม้ OCR อ่านขีดหาย', () => {
    const card = replace('System Generate Date : 23-10-2569', {
      text: 'System Generate Date : 23102569',
      score: 0.98,
    });
    expect(checkCard(card, expect106)).toMatchObject({ ok: false, code: 'CARD_UNREADABLE' });
  });
});
