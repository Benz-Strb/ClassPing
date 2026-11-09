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
