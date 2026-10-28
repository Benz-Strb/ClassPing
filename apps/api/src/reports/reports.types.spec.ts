import { describe, expect, it } from 'vitest';
import { attendanceFilterSchema } from './reports.types.js';

describe('attendanceFilterSchema', () => {
  it('ปฏิเสธวันที่ที่ไม่มีอยู่จริง', () => {
    expect(() => attendanceFilterSchema.parse({ startDate: '2026-99-99' })).toThrow();
  });

  it('ปฏิเสธช่วงวันที่ที่วันเริ่มต้นอยู่หลังวันสิ้นสุด', () => {
    expect(() =>
      attendanceFilterSchema.parse({
        startDate: '2026-10-31',
        endDate: '2026-10-01',
      }),
    ).toThrow();
  });
});
