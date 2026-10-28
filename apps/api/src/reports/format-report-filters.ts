import type { AttendanceReportResponse } from './reports.types.js';

export function formatReportFilters(report: AttendanceReportResponse): string[] {
  const { filter } = report;
  const lines = [
    `ประเภทคาบ: ${filter.kind === 'all' ? 'ทั้งหมด' : filter.kind === 'class' ? 'คาบเรียน' : 'คาบสอบ'}`,
  ];
  if (filter.startDate || filter.endDate) {
    lines.push(`ช่วงวันที่: ${filter.startDate ?? '-'} ถึง ${filter.endDate ?? '-'}`);
  }
  if (filter.sessionId) {
    const session = report.sessions.find((item) => item.sessionId === filter.sessionId);
    const label = session
      ? `${session.onDate}${session.kind === 'exam' ? ` [สอบ] ${session.title ?? ''}` : ' คาบเรียน'}`.trim()
      : filter.sessionId;
    lines.push(`คาบ: ${label}`);
  }
  if (filter.studentCode) lines.push(`รหัสนักศึกษา: ${filter.studentCode}`);
  return lines;
}
