import { describe, expect, it } from 'vitest';
import { extractLeaveDraft, documentDetailsSchema } from './leave-draft.js';

describe('structured leave draft', () => {
  it('extracts labelled facts, Buddhist dates and Thai digits without using the header as a reason', () => {
    const draft = extractLeaveDraft(`โรงพยาบาลตัวอย่าง
วันที่ ๒๙ ตุลาคม ๒๕๖๙
ใบรับรองแพทย์
พบว่า กล้ามเนื้ออักเสบ
เห็นควรให้หยุดพักเป็นจำนวน 2 วัน ตั้งแต่วันที่ 29 ตุลาคม 2569 ถึงวันที่ 30 ตุลาคม 2569`);
    expect(draft).toEqual({ reason: 'กล้ามเนื้ออักเสบ', documentDetails: {
      facility: 'โรงพยาบาลตัวอย่าง', documentDate: '2026-10-29', leaveStartDate: '2026-10-29', leaveEndDate: '2026-10-30',
    }, missingFields: [] });
  });
  it('leaves unknown fields empty and does not infer leave dates from issue date or duration', () => {
    const draft = extractLeaveDraft('บริษัท ตัวอย่าง\nวันที่ 8/11/2569\nเห็นควรให้พักรักษาตัว 2 วัน');
    expect(draft.documentDetails).toEqual({ facility: '', documentDate: '2026-11-08', leaveStartDate: '', leaveEndDate: '' });
    expect(extractLeaveDraft('ข้อความทั่วไป').reason).toBe('');
  });
  it('reads the issue date from the next line when the label stands alone', () => {
    const draft = extractLeaveDraft('ใบรับรองแพทย์\nวันที่\n29 ตุลาคม 2569\nได้รับการตรวจรักษา เมื่อวันที่ 29 ตุลาคม 2569');
    expect(draft.documentDetails.documentDate).toBe('2026-10-29');
    expect(extractLeaveDraft('วันที่\nชื่อ นายทดสอบ').documentDetails.documentDate).toBe('');
  });
  it('reads leave periods written in common certificate styles', () => {
    const period = (text: string) => {
      const { leaveStartDate, leaveEndDate } = extractLeaveDraft(text).documentDetails;
      return [leaveStartDate, leaveEndDate];
    };
    const both = ['2026-10-29', '2026-10-30'];
    expect(period('ตั้งแต่วันที่ 29 ตุลาคม 2569 ถึงวันที่ 30 ตุลาคม 2569')).toEqual(both);
    expect(period('ตั้งแต่วันที่ 29 ตุลาคม 2569 ถึง 30 ตุลาคม 2569')).toEqual(both);
    expect(period('ตั้งแต่วันที่ 29 ตุลาคม 2569 ถึง วันที่ 30 ตุลาคม 2569')).toEqual(both);
    expect(period('ตั้งแต่วันที่ 29 ตุลาคม 2569 จนถึง 30 ตุลาคม 2569')).toEqual(both);
    expect(period('ตั้งแต่วันที่ 29 ตุลาคม 2569 - 30 ตุลาคม 2569')).toEqual(both);
    expect(period('ตั้งแต่วันที่ 29 ต.ค. 2569 ถึงวันที่ 30 ต.ค. 2569')).toEqual(both);
    expect(period('ตั้งแต่วันที่ 29 ต.ค. 69 ถึงวันที่ 30 ต.ค. 69')).toEqual(both);
    expect(period('ตั้งแต่วันที่ 29/10/2569 ถึงวันที่ 30/10/2569')).toEqual(both);
    expect(period('ตั้งแต่วันที่ 29/10/69 ถึง 30/10/69')).toEqual(both);
    expect(period('ตั้งแต่วันที่ 29 ตุลาคม 2569\nถึงวันที่ 30 ตุลาคม 2569')).toEqual(both);
    expect(period('ตั้งแต่วันที่ 29-30 ตุลาคม 2569')).toEqual(both);
    expect(period('ตั้งแต่วันที่ 29 ตุลาคม พ.ศ. 2569 ถึงวันที่ 30 ตุลาคม พ.ศ. 2569 รวม 2 วัน')).toEqual(both);
    // OCR ทำวรรณยุกต์หล่น
    expect(period('วัน ตั้งแตวันที่ 29 ตุลาคม 2569 ถึงวันที 30 ตุลาคม 2569')).toEqual(both);
    expect(extractLeaveDraft('วันที\n29 ตุลาคม 2569').documentDetails.documentDate).toBe('2026-10-29');
    // OCR อ่านเดือนหรือปีของวันสิ้นสุดเพี้ยน ใช้เดือนและปีของวันเริ่ม
    expect(period('วันตั้งแต่วันที่ 29 ตุลาคม 2569 ถึงวันที่ 30 ุาคม 2669')).toEqual(both);
    expect(period('วันตั้งแต่วันที่ 29 ตุลาม 2569 ถึงวันที่ 30 ตุลาคม 2569')).toEqual(both);
    expect(period('ตั้งแต่วันที่ 29 ตลาคม 2569 ถึงวันที่ 30 ตุลาคม 2569')).toEqual(both);
    expect(period('ตั้งแต่วันที่ 29 xxคม 2569 ถึงวันที่ 30 ตุลาคม 2569')).toEqual(['', '']);
    expect(period('ตั้งแต่วันที่ 29 ตุลาคม 2569 ถึง 30')).toEqual(both);
    expect(period('ตั้งแต่วันที่ 29 ตุลาคม 2569 ถึงวันที่ 30 ตุลาคม 2669')).toEqual(both);
    expect(period('ตั้งแต่วันที่ 30 ธันวาคม 2569 ถึงวันที่ 2 มกราคม 2570')).toEqual(['2026-12-30', '2027-01-02']);
    expect(period('ตั้งแต่วันที่ 29 ตุลาคม 2569 ถึงวันที่ 2 ุศจิกายน 2569')).toEqual(['2026-10-29', '2026-11-02']);
    expect(period('ตั้งแต่วันที่ 29 ตุลาคม 2569 ถึงวันที่ 2 xxxx 2569')).toEqual(['2026-10-29', '']);
    expect(period('ตั้งแต่วันที่ 30 ตุลาคม 2569 ถึง 29 ตุลาคม 2569')).toEqual(['2026-10-30', '']);
    expect(period('ตั้งแต่วันที่ 30-29 ตุลาคม 2569')).toEqual(['2026-10-30', '']);
  });
  it('reads short month names even when OCR drops the dots', () => {
    const short = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    const month = (name: string) => extractLeaveDraft(`ตั้งแต่วันที่ 1 ${name} 2569`).documentDetails.leaveStartDate.slice(5, 7);
    const expected = short.map((_, i) => String(i + 1).padStart(2, '0'));
    expect(short.map(month)).toEqual(expected);
    expect(short.map((name) => month(name.replace(/\.$/, '')))).toEqual(expected);
    expect(short.map((name) => month(name.replace(/\./g, '')))).toEqual(expected);
  });
  it('picks the month nearest today only when a misread fits several months equally', () => {
    const start = (month: string, now: string) =>
      extractLeaveDraft(`ตั้งแต่วันที่ 1 ${month} 2569`, new Date(now)).documentDetails.leaveStartDate;
    // มาคม ห่างจาก มกราคม และ มีนาคม เท่ากัน
    expect(start('มาคม', '2026-11-09T00:00:00Z')).toBe('2026-03-01');
    expect(start('มาคม', '2026-01-05T00:00:00Z')).toBe('2026-01-01');
    // เดือนที่ตรงกว่าชนะเสมอ ไม่ว่าวันนี้เป็นวันไหน
    expect(start('มกาคม', '2026-11-09T00:00:00Z')).toBe('2026-01-01');
  });
  it('does not carry identity fields into an empty reason label', () => {
    expect(extractLeaveDraft('เหตุผล:\nชื่อ นายทดสอบ').reason).toBe('');
  });
  it('rejects impossible dates and reversed leave periods without crashing', () => {
    for (const documentDate of ['2026-02-30', '2026-99-99', '2569-11-08', 'tomorrow']) {
      expect(documentDetailsSchema.safeParse({ documentDate }).success).toBe(false);
    }
    expect(documentDetailsSchema.safeParse({ leaveStartDate: '2026-11-09', leaveEndDate: '2026-11-08' }).success).toBe(false);
    expect(extractLeaveDraft('วันที่ 31 กุมภาพันธ์ 2569').documentDetails.documentDate).toBe('');
  });
  it('caps only recognized reasons, not arbitrary raw OCR', () => {
    expect(extractLeaveDraft('เหตุผล: ' + 'ก'.repeat(1200)).reason).toHaveLength(1000);
  });
});
