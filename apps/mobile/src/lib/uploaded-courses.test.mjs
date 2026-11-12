import test from 'node:test';
import assert from 'node:assert/strict';
import { uploadedCourses } from './uploaded-courses.ts';

const row = { courseCode: 'CE360', courseName: 'Software', section: '001', teacherName: 'อาจารย์', weekday: 1, startTime: '09:00', endTime: '12:00', roomName: '101' };

test('groups repeated course slots while retaining distinct schedule details', () => {
  const result = uploadedCourses([row, { ...row }, { ...row, weekday: 3 }], []);
  assert.equal(result.length, 1);
  assert.equal(result[0].rows.length, 2);
});
test('deduplicates registered courses using normalized course codes and sections', () => {
  assert.equal(uploadedCourses([row], [{ code: 'ce 360', section: '1' }]).length, 0);
});
test('preserves different sections and does not guess a missing section', () => {
  const result = uploadedCourses([row, { ...row, section: '002' }, { ...row, section: '' }], [{ code: 'CE360', section: '1' }]);
  assert.deepEqual(result.map(item => item.section), ['002', '']);
});
test('ignores rows without course codes and preserves incomplete OCR for review', () => {
  const result = uploadedCourses([{ ...row, courseCode: '' }, { ...row, weekday: null, teacherName: '' }], []);
  assert.equal(result.length, 1);
  assert.equal(result[0].rows[0].weekday, null);
});
