import { describe, expect, it } from 'vitest';
import { generateAttendanceCsv } from './export-csv.js';
import { generateAttendancePdf } from './export-pdf.js';
import type { AttendanceReportResponse } from './reports.types.js';

const mockReport: AttendanceReportResponse = {
  course: {
    id: 'course-1',
    code: 'CPE101',
    name: 'Computer Programming',
    section: '1',
  },
  filter: {
    kind: 'all',
    startDate: '2026-10-01',
    endDate: '2026-10-31',
  },
  summary: {
    totalSessions: 2,
    totalStudents: 2,
    counts: {
      present: 2,
      late: 1,
      absent: 1,
      leave: 0,
      pending: 0,
      total: 4,
    },
    attendanceRate: 75.0,
  },
  sessions: [
    {
      sessionId: 'sess-1',
      onDate: '2026-10-05',
      startsAt: '2026-10-05T09:00:00Z',
      endsAt: '2026-10-05T12:00:00Z',
      kind: 'class',
      title: null,
      roomName: 'LAB 1',
      counts: {
        present: 2,
        late: 0,
        absent: 0,
        leave: 0,
        pending: 0,
        total: 2,
      },
    },
    {
      sessionId: 'sess-2',
      onDate: '2026-10-12',
      startsAt: '2026-10-12T09:00:00Z',
      endsAt: '2026-10-12T12:00:00Z',
      kind: 'exam',
      title: 'Midterm Exam',
      roomName: 'ROOM 101',
      counts: {
        present: 0,
        late: 1,
        absent: 1,
        leave: 0,
        pending: 0,
        total: 2,
      },
    },
  ],
  students: [
    {
      studentCode: '66000001',
      fullName: 'สมชาย รักเรียน',
      userId: 'user-1',
      counts: {
        present: 1,
        late: 1,
        absent: 0,
        leave: 0,
        pending: 0,
        total: 2,
      },
      totalSessions: 2,
      attendanceRate: 100.0,
      sessions: [
        {
          sessionId: 'sess-1',
          onDate: '2026-10-05',
          startsAt: '2026-10-05T09:00:00Z',
          endsAt: '2026-10-05T12:00:00Z',
          kind: 'class',
          title: null,
          status: 'present',
        },
        {
          sessionId: 'sess-2',
          onDate: '2026-10-12',
          startsAt: '2026-10-12T09:00:00Z',
          endsAt: '2026-10-12T12:00:00Z',
          kind: 'exam',
          title: 'Midterm Exam',
          status: 'late',
        },
      ],
    },
    {
      studentCode: '66000002',
      fullName: 'สมหญิง จริงใจ',
      userId: 'user-2',
      counts: {
        present: 1,
        late: 0,
        absent: 1,
        leave: 0,
        pending: 0,
        total: 2,
      },
      totalSessions: 2,
      attendanceRate: 50.0,
      sessions: [
        {
          sessionId: 'sess-1',
          onDate: '2026-10-05',
          startsAt: '2026-10-05T09:00:00Z',
          endsAt: '2026-10-05T12:00:00Z',
          kind: 'class',
          title: null,
          status: 'present',
        },
        {
          sessionId: 'sess-2',
          onDate: '2026-10-12',
          startsAt: '2026-10-12T09:00:00Z',
          endsAt: '2026-10-12T12:00:00Z',
          kind: 'exam',
          title: 'Midterm Exam',
          status: 'absent',
        },
      ],
    },
  ],
};

describe('export-csv', () => {
  it('ระบุคาบและนักศึกษาที่ใช้กรองในไฟล์ส่งออก', () => {
    const report = structuredClone(mockReport);
    report.filter.sessionId = 'sess-2';
    report.filter.studentCode = '66000002';

    const csv = generateAttendanceCsv(report);

    expect(csv).toContain('คาบ: 2026-10-12 [สอบ] Midterm Exam');
    expect(csv).toContain('รหัสนักศึกษา: 66000002');
  });

  it('สร้าง CSV ที่มี UTF-8 BOM และรายละเอียดวิชาถูกต้อง', () => {
    const csv = generateAttendanceCsv(mockReport);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('CPE101');
    expect(csv).toContain('Computer Programming');
    expect(csv).toContain('สมชาย รักเรียน');
    expect(csv).toContain('สมหญิง จริงใจ');
    expect(csv).toContain('66000001');
    expect(csv).toContain('66000002');
    expect(csv).toContain('[สอบ] Midterm Exam');
  });

  it('ป้องกัน Excel ตีความข้อมูลผู้ใช้เป็นสูตร', () => {
    const report = structuredClone(mockReport);
    report.students[0].fullName = '=HYPERLINK("https://example.test")';

    const csv = generateAttendanceCsv(report);

    expect(csv).toContain('"\'=HYPERLINK(""https://example.test"")"');
  });

  it('ป้องกันสูตรที่ซ่อนหลังช่องว่างหรือขึ้นบรรทัดใหม่', () => {
    const report = structuredClone(mockReport);
    report.students[0].fullName = '\n=1+1';

    expect(generateAttendanceCsv(report)).toContain('"\'\n=1+1"');
  });
});

describe('export-pdf', () => {
  it('สร้าง PDF binary ที่มี PDF header', async () => {
    const pdf = await generateAttendancePdf(mockReport);
    expect(Buffer.isBuffer(pdf)).toBe(true);
    const text = pdf.toString('latin1');
    expect(text.startsWith('%PDF-')).toBe(true);
    expect(text).toContain('%%EOF');
  });

  it('ฝังฟอนต์ที่รองรับภาษาไทยลงใน PDF', async () => {
    const pdf = (await generateAttendancePdf(mockReport)).toString('latin1');

    expect(pdf).toMatch(/\/FontFile\d?\b/);
    expect(pdf).not.toContain('/BaseFont /Helvetica');
  });

  it('สร้างหน้าถัดไปเมื่อรายชื่อนักศึกษายาวเกินหนึ่งหน้า', async () => {
    const report = structuredClone(mockReport);
    report.students = Array.from({ length: 80 }, (_, index) => ({
      ...structuredClone(mockReport.students[index % mockReport.students.length]),
      studentCode: String(66000001 + index),
    }));
    report.summary.totalStudents = report.students.length;

    const pdf = (await generateAttendancePdf(report)).toString('latin1');
    const pageCount = pdf.match(/\/Type \/Page\b/g)?.length ?? 0;

    expect(pageCount).toBeGreaterThan(1);
  });
});
