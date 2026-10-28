import type { AttendanceReportResponse } from './reports.types.js';
import { formatReportFilters } from './format-report-filters.js';

function escapeCsv(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return '""';
  const raw = String(val);
  const str = typeof val === 'string' && /^\s*[=+\-@]/u.test(raw) ? `'${raw}` : raw;
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
}

export function generateAttendanceCsv(report: AttendanceReportResponse): string {
  const lines: string[] = [];

  // UTF-8 BOM เพื่อให้โปรแกรมเช่น MS Excel อ่านภาษาไทยถูกต้อง
  const BOM = '\uFEFF';

  // หัวรายงาน
  lines.push(`${escapeCsv('รายงานการเข้าเรียน')} - ${escapeCsv(report.course.code)} ${escapeCsv(report.course.name)}${report.course.section ? ` กลุ่ม ${escapeCsv(report.course.section)}` : ''}`);
  lines.push(...formatReportFilters(report).map(escapeCsv));
  lines.push('');

  // สรุปภาพรวม
  lines.push('--- สรุปภาพรวม ---');
  lines.push(`จำนวนคาบทั้งหมด,${report.summary.totalSessions}`);
  lines.push(`จำนวนนักศึกษาทั้งหมด,${report.summary.totalStudents}`);
  lines.push(`มาเรียน (Present),${report.summary.counts.present}`);
  lines.push(`สาย (Late),${report.summary.counts.late}`);
  lines.push(`ขาดเรียน (Absent),${report.summary.counts.absent}`);
  lines.push(`ลา (Leave),${report.summary.counts.leave}`);
  lines.push(`รอตรวจ (Pending),${report.summary.counts.pending}`);
  lines.push(`อัตราการเข้าเรียนเฉลี่ย,${report.summary.attendanceRate}%`);
  lines.push('');

  // ตารางนักศึกษา
  const sessionHeaders = report.sessions.map((s) => {
    const label = s.kind === 'exam' ? `[สอบ] ${s.title ?? s.onDate}` : s.onDate;
    return escapeCsv(label);
  });

  const headerRow = [
    escapeCsv('รหัสนักศึกษา'),
    escapeCsv('ชื่อ-นามสกุล'),
    escapeCsv('มาเรียน'),
    escapeCsv('สาย'),
    escapeCsv('ขาด'),
    escapeCsv('ลา'),
    escapeCsv('รอตรวจ'),
    escapeCsv('รวมคาบ'),
    escapeCsv('อัตราเข้าเรียน (%)'),
    ...sessionHeaders,
  ];
  lines.push(headerRow.join(','));

  const statusLabelMap: Record<string, string> = {
    present: 'มา',
    late: 'สาย',
    absent: 'ขาด',
    leave: 'ลา',
    pending: 'รอตรวจ',
    unrecorded: '-',
  };

  for (const student of report.students) {
    const sessionCols = student.sessions.map((s) => escapeCsv(statusLabelMap[s.status] ?? s.status));
    const row = [
      escapeCsv(student.studentCode),
      escapeCsv(student.fullName ?? '-'),
      student.counts.present,
      student.counts.late,
      student.counts.absent,
      student.counts.leave,
      student.counts.pending,
      student.counts.total,
      `${student.attendanceRate}%`,
      ...sessionCols,
    ];
    lines.push(row.join(','));
  }

  return BOM + lines.join('\r\n');
}
