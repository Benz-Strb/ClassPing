import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReportQuery } from './reports.ts';

test('สร้าง query เดียวกันจากตัวกรองที่นำไปใช้แล้ว รวมตัวกรองคาบเรียน', () => {
  assert.equal(
    buildReportQuery({
      kind: 'exam',
      sessionId: 'session-1',
      startDate: '2026-10-01',
      endDate: '2026-10-31',
      studentCode: ' 66000001 ',
    }),
    '?kind=exam&sessionId=session-1&startDate=2026-10-01&endDate=2026-10-31&studentCode=66000001',
  );
});

test('ไม่สร้าง query เมื่อใช้ตัวกรองค่าเริ่มต้น', () => {
  assert.equal(
    buildReportQuery({
      kind: 'all',
      sessionId: '',
      startDate: '',
      endDate: '',
      studentCode: '',
    }),
    '',
  );
});
