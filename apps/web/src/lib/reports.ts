export interface ReportFilters {
  kind: 'all' | 'class' | 'exam';
  sessionId: string;
  startDate: string;
  endDate: string;
  studentCode: string;
}

export function buildReportQuery(filters: ReportFilters): string {
  const params = new URLSearchParams();
  if (filters.kind !== 'all') params.set('kind', filters.kind);
  if (filters.sessionId) params.set('sessionId', filters.sessionId);
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  if (filters.studentCode.trim()) params.set('studentCode', filters.studentCode.trim());
  const query = params.toString();
  return query ? `?${query}` : '';
}

// ยังไม่มีคาบที่ตัดสินผล (ไม่นับรอตรวจ) แสดง - แทน 0%
export function formatRate(
  counts: { total: number; pending: number },
  rate: number,
): string {
  return counts.total - counts.pending > 0 ? `${rate}%` : '-';
}
