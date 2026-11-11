import { checkCard, readStudyInfo, type CardLine } from './card-check.js';

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

  // OCR อาจตัดบรรทัดตรงช่องว่างก่อน ID
  it('OCR ตัด OFFICIAL STUDENT VIRTUAL ID เป็นหลายบรรทัดติดกัน ยังผ่าน', () => {
    const card = CARD.flatMap((l) =>
      l.text === 'OFFICIAL STUDENT VIRTUAL ID'
        ? [
            { text: 'OFFICIAL', score: 0.957 },
            { text: 'STUDENT VIRTUAL', score: 0.99 },
            { text: 'ID', score: 0.997 },
          ]
        : [l],
    );
    expect(checkCard(card, expect106)).toEqual({ ok: true });
  });

  it('ชิ้นส่วนของ marker ที่ OCR ไม่มั่นใจ ไม่นับ', () => {
    const card = CARD.flatMap((l) =>
      l.text === 'OFFICIAL STUDENT VIRTUAL ID'
        ? [
            { text: 'OFFICIAL STUDENT VIRTUAL', score: 0.994 },
            { text: 'ID', score: 0.5 },
          ]
        : [l],
    );
    expect(checkCard(card, expect106)).toMatchObject({ ok: false, code: 'CARD_UNREADABLE' });
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

  it('วันออกบัตรที่ OCR อ่านขีดหาย ไม่ถูกนับเป็นรหัสคนอื่น', () => {
    const card = replace('5uənas : 27-05-2566', { text: '5uənas : 27052566', score: 0.95 });
    expect(checkCard(card, expect106)).toEqual({ ok: true });
  });

  it('วันที่ไม่มีขีดแยกอยู่คนละบรรทัด ไม่ถูกนับเป็นรหัส', () => {
    const card = [...CARD, { text: '23102569', score: 0.99 }];
    expect(checkCard(card, expect106)).toEqual({ ok: true });
  });

  it('OCR แยกวันที่ออกจากบรรทัด Generate ยังอ่านได้', () => {
    const card = CARD.flatMap((l) =>
      l.text.startsWith('System Generate')
        ? [
            { text: 'System Generate Date :', score: 0.98 },
            { text: '23-10-2569', score: 0.98 },
          ]
        : [l],
    );
    expect(checkCard(card, expect106)).toEqual({ ok: true });
  });
});

describe('checkCard กับ Typhoon', () => {
  // Typhoon ไม่ส่งความมั่นใจ และอาจคืนส่วนของบัตรเป็นตาราง HTML หรือ markdown
  const TYPHOON: CardLine[] = [
    { text: 'DHURAKIJ PUNDIT UNIVERSITY', score: null },
    { text: '<table><tr><td>รหัสนักศึกษา</td><td>66112106</td></tr></table>', score: null },
    { text: '| System Generate Date : | 23-10-2569 |', score: null },
    { text: 'OFFICIAL STUDENT VIRTUAL ID', score: null },
  ];

  it('บรรทัดไม่มีคะแนนใช้ได้ทุกบรรทัด และเอาแท็กตารางออกก่อนอ่าน', () => {
    expect(checkCard(TYPHOON, expect106)).toEqual({ ok: true });
  });

  it('รหัสคนอื่นในตารางยังจับได้', () => {
    const card = TYPHOON.map((l) => ({ ...l, text: l.text.replace('66112106', '66112126') }));
    expect(checkCard(card, expect106)).toMatchObject({ ok: false, code: 'CARD_NOT_YOURS' });
  });

  it('วันที่ที่ใช้ขีดยาวยังอ่านได้', () => {
    const card = TYPHOON.map((l) => ({ ...l, text: l.text.replace('23-10-2569', '23–10–2569') }));
    expect(checkCard(card, expect106)).toEqual({ ok: true });
  });

  it('อ่านคณะและสาขาในเซลล์ตารางได้', () => {
    expect(
      readStudyInfo([
        { text: '<td>วิทยาลัยวิศวกรรมศาสตร์และเทคโนโลยี</td>', score: null },
        { text: '| สาขาวิชาวิศวกรรมคอมพิวเตอร์ |', score: null },
      ]),
    ).toEqual({
      faculty: 'วิทยาลัยวิศวกรรมศาสตร์และเทคโนโลยี',
      major: 'สาขาวิชาวิศวกรรมคอมพิวเตอร์',
    });
  });
});

describe('readStudyInfo', () => {
  it('อ่านคณะและสาขาจากบรรทัดบนบัตร', () => {
    expect(
      readStudyInfo([
        ...CARD,
        { text: ' วิทยาลัยวิศวกรรมศาสตร์และเทคโนโลยี ', score: 0.99 },
        { text: 'สาขาวิชาวิศวกรรมคอมพิวเตอร์', score: 1 },
      ]),
    ).toEqual({
      faculty: 'วิทยาลัยวิศวกรรมศาสตร์และเทคโนโลยี',
      major: 'สาขาวิชาวิศวกรรมคอมพิวเตอร์',
    });
  });

  it('บัตรที่ขึ้นต้นด้วยคณะหรือสถาบันก็อ่านได้', () => {
    expect(readStudyInfo([{ text: 'คณะบริหารธุรกิจ', score: 0.95 }]).faculty).toBe('คณะบริหารธุรกิจ');
    expect(readStudyInfo([{ text: 'สถาบันการเรียนรู้', score: 0.95 }]).faculty).toBe(
      'สถาบันการเรียนรู้',
    );
  });

  it('บรรทัดที่ OCR ไม่มั่นใจหรืออ่านไม่เจอ เก็บเป็นค่าว่าง', () => {
    expect(
      readStudyInfo([
        { text: 'วิทยาลัยวิศวกรรมศาสตร์', score: 0.6 },
        { text: 'สาขาวิชาคอมพิวเตอร์', score: 0.89 },
      ]),
    ).toEqual({ faculty: null, major: null });
    expect(readStudyInfo(CARD)).toEqual({ faculty: null, major: null });
  });
});
