import { parseStudentCodes } from './parse-student-codes.js';

describe('parseStudentCodes', () => {
  it('แยกด้วยขึ้นบรรทัด ช่องว่าง จุลภาค ตัดซ้ำ และคงลำดับ', () => {
    expect(parseStudentCodes('66112106\n 66112126, 66112106 abc')).toEqual({
      valid: ['66112106', '66112126'],
      invalid: ['abc'],
    });
  });

  it('วางจาก Excel (tab, ขึ้นบรรทัดแบบ Windows) ได้', () => {
    expect(parseStudentCodes('66112106\t66112126\r\n66112127;')).toEqual({
      valid: ['66112106', '66112126'],
      invalid: ['66112127;'],
    });
  });

  it('ข้อความว่างได้ลิสต์ว่าง', () => {
    expect(parseStudentCodes('  \n , ')).toEqual({ valid: [], invalid: [] });
  });

  it('รหัสที่มีตัวอักษร หรือยาวเกิน 20 หลัก ไม่ถูกต้อง และตัดซ้ำด้วย', () => {
    expect(parseStudentCodes('6611210a 1234567890123456789012 6611210a')).toEqual({
      valid: [],
      invalid: ['6611210a', '1234567890123456789012'],
    });
  });
});
