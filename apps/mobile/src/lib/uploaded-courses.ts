import type { TimetableEntry } from './timetable-grid';

const codeKey = (value: string) => value.normalize('NFKC').replace(/\s/g, '').toUpperCase();
const sectionKey = (value: string | null) => /^\d+$/.test(value?.trim() ?? '') ? String(Number(value)) : (value ?? '').normalize('NFKC').trim().toUpperCase();
const courseKey = (code: string, section: string | null) => JSON.stringify([codeKey(code), sectionKey(section)]);

export function uploadedCourses(rows: TimetableEntry[], registered: { code: string; section: string | null }[]) {
  const existing = new Set(registered.map(item => courseKey(item.code, item.section)));
  const grouped = new Map<string, { key: string; code: string; name: string; section: string; rows: TimetableEntry[] }>();
  for (const row of rows) {
    const key = courseKey(row.courseCode, row.section);
    if (!codeKey(row.courseCode) || existing.has(key)) continue;
    let course = grouped.get(key);
    if (!course) {
      course = { key, code: row.courseCode, name: row.courseName, section: row.section, rows: [] };
      grouped.set(key, course);
    }
    if (!course.rows.some(item => item.weekday === row.weekday && item.startTime === row.startTime && item.endTime === row.endTime && item.roomName === row.roomName && item.teacherName === row.teacherName)) course.rows.push(row);
  }
  return [...grouped.values()];
}
