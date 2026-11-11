import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTimetableGrid, timeMinutes } from './timetable-grid.ts';

const entry = {
  courseCode: 'CE360', courseName: 'เทคโนโลยีบล็อกเชน', section: '511',
  roomName: '51106', teacherName: 'ดร. สมชาย ใจดี', weekday: 1,
  startTime: '09:00', endTime: '10:30',
};

test('positions half-hour cards proportionally and orders weekdays Monday first', () => {
  const grid = buildTimetableGrid([entry, { ...entry, weekday: 0, startTime: '13:30', endTime: '16:30' }]);
  assert.equal(grid.placements[0].x, 284);
  assert.equal(grid.placements[0].width, 262);
  assert.equal(grid.placements[1].x, 1094);
  assert.ok(grid.placements[1].y > grid.placements[0].y);
});

test('separates simultaneous courses and reuses lanes after a course ends', () => {
  const grid = buildTimetableGrid([
    entry, { ...entry, startTime: '09:30', endTime: '11:00' },
    { ...entry, startTime: '10:30', endTime: '12:00' },
  ]);
  assert.deepEqual(grid.placements.map(card => card.lane), [0, 1, 0]);
});

test('expands hours and excludes incomplete or invalid times without guessing', () => {
  const grid = buildTimetableGrid([
    { ...entry, startTime: '06:30', endTime: '22:00' },
    { ...entry, weekday: null }, { ...entry, startTime: '25:00' },
    { ...entry, startTime: '12:00', endTime: '09:00' },
  ]);
  assert.equal(grid.omitted, 3);
  assert.equal(grid.placements.length, 1);
  assert.equal(grid.width, 100 + 16 * 180);
  assert.equal(timeMinutes('09:60'), null);
});

test('escapes OCR text in exported SVG and retains all course details', () => {
  const grid = buildTimetableGrid([{ ...entry, courseName: '<script>& test' }]);
  assert.ok(!grid.xml.includes('<script>'));
  assert.ok(grid.xml.includes('&lt;script&gt;&amp;'));
  for (const value of ['CE360', '511', '51106', '09:00', '10:30', 'สมชาย']) assert.ok(grid.xml.includes(value));
});
