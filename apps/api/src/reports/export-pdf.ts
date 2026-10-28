import { createRequire } from 'node:module';
import PDFDocument from 'pdfkit';
import { formatReportFilters } from './format-report-filters.js';
import type { AttendanceReportResponse } from './reports.types.js';

const require = createRequire(import.meta.url);
const regularFont = require.resolve(
  '@expo-google-fonts/noto-sans-thai/400Regular/NotoSansThai_400Regular.ttf',
);
const boldFont = require.resolve(
  '@expo-google-fonts/noto-sans-thai/700Bold/NotoSansThai_700Bold.ttf',
);

const columns = [
  { label: 'รหัสนักศึกษา', key: 'code', width: 90 },
  { label: 'ชื่อ-นามสกุล', key: 'name', width: 180 },
  { label: 'มา', key: 'present', width: 50 },
  { label: 'สาย', key: 'late', width: 50 },
  { label: 'ขาด', key: 'absent', width: 50 },
  { label: 'ลา', key: 'leave', width: 50 },
  { label: 'รอตรวจ', key: 'pending', width: 60 },
  { label: 'รวม', key: 'total', width: 50 },
  { label: 'อัตรา', key: 'rate', width: 60 },
] as const;

export async function generateAttendancePdf(report: AttendanceReportResponse): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });
  const chunks: Buffer[] = [];
  const completed = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  doc.registerFont('NotoThai', regularFont);
  doc.registerFont('NotoThaiBold', boldFont);
  doc.font('NotoThaiBold').fontSize(16).text('รายงานการเข้าเรียน');
  doc
    .font('NotoThai')
    .fontSize(10)
    .text(
      `${report.course.code} ${report.course.name}${report.course.section ? ` กลุ่ม ${report.course.section}` : ''}`,
    );
  for (const line of formatReportFilters(report)) doc.text(line);
  doc.text(
    `คาบ ${report.summary.totalSessions} · นักศึกษา ${report.summary.totalStudents} · อัตราเข้าเรียน ${report.summary.attendanceRate}%`,
    )
    .text(
      `มา ${report.summary.counts.present} · สาย ${report.summary.counts.late} · ขาด ${report.summary.counts.absent} · ลา ${report.summary.counts.leave} · รอตรวจ ${report.summary.counts.pending}`,
    );

  let y = doc.y + 10;
  const tableWidth = columns.reduce((sum, column) => sum + column.width, 0);

  const drawHeader = () => {
    let x = doc.page.margins.left;
    doc.rect(x, y, tableWidth, 20).fill('#e5e7eb');
    doc.fillColor('#111827').font('NotoThaiBold').fontSize(9);
    for (const column of columns) {
      doc.text(column.label, x + 3, y + 4, {
        width: column.width - 6,
        align: column.key === 'name' || column.key === 'code' ? 'left' : 'center',
        lineBreak: false,
      });
      x += column.width;
    }
    y += 20;
  };

  drawHeader();

  for (const student of report.students) {
    if (y + 18 > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      y = doc.page.margins.top;
      drawHeader();
    }

    const values: Record<(typeof columns)[number]['key'], string> = {
      code: student.studentCode,
      name: student.fullName ?? '-',
      present: String(student.counts.present),
      late: String(student.counts.late),
      absent: String(student.counts.absent),
      leave: String(student.counts.leave),
      pending: String(student.counts.pending),
      total: String(student.counts.total),
      rate: `${student.attendanceRate}%`,
    };

    let x = doc.page.margins.left;
    doc.font('NotoThai').fontSize(8).fillColor('#111827');
    for (const column of columns) {
      doc.text(values[column.key], x + 3, y + 3, {
        width: column.width - 6,
        height: 14,
        align: column.key === 'name' || column.key === 'code' ? 'left' : 'center',
        ellipsis: true,
        lineBreak: false,
      });
      x += column.width;
    }
    doc
      .moveTo(doc.page.margins.left, y + 18)
      .lineTo(doc.page.margins.left + tableWidth, y + 18)
      .stroke('#e5e7eb');
    y += 18;
  }

  doc.end();
  return completed;
}
