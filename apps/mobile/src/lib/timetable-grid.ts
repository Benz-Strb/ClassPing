export interface TimetableEntry {
  courseCode: string;
  courseName: string;
  section: string;
  roomName: string;
  teacherName: string;
  weekday: number | null;
  startTime: string;
  endTime: string;
}

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_NAMES = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const PALETTE = ['#F8D9E8', '#D6EFDC', '#ECF4C5', '#FAD9CD', '#DEDDF7', '#D3EDF5', '#F4E4C8'];
const HOUR_WIDTH = 180;
const LABEL_WIDTH = 100;
const escapeXml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!);

export function timeMinutes(value: string): number | null {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function wrap(value: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  let used = 0;
  for (const char of value) {
    const size = /\p{M}/u.test(char) ? 0 : /[A-Zก-ฮ]/.test(char) ? 11 : 9;
    if (used + size > width && line) { lines.push(line.trim()); line = ''; used = 0; }
    line += char;
    used += size;
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

export function buildTimetableGrid(rows: TimetableEntry[], identity?: { fullName: string; studentId: string }) {
  const valid = rows.flatMap((row, index) => {
    const start = timeMinutes(row.startTime);
    const end = timeMinutes(row.endTime);
    return row.weekday !== null && DAY_ORDER.includes(row.weekday) && start !== null && end !== null && start < end
      ? [{ row, index, start, end }] : [];
  });
  const startHour = Math.min(8, ...valid.map(item => Math.floor(item.start / 60)));
  const endHour = Math.max(18, ...valid.map(item => Math.ceil(item.end / 60)));
  const width = LABEL_WIDTH + (endHour - startHour) * HOUR_WIDTH;
  const text = (x: number, y: number, value: string, size = 18, fill = '#282330', extra = '') =>
    `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" ${extra}>${escapeXml(value)}</text>`;
  const parts = [text(24, 38, 'ตารางเรียนรายสัปดาห์', 30, '#4D3282', 'font-weight="600"')];
  const headerY = identity ? 96 : 56;
  if (identity) parts.push(text(24, 74, `${identity.fullName} · เลขนักศึกษา ${identity.studentId}`, 20, '#4D3282'));
  const courseColors = new Map<string, string>();
  for (const { row } of valid) {
    const key = `${row.courseCode}:${row.section}`;
    if (!courseColors.has(key)) courseColors.set(key, PALETTE[courseColors.size % PALETTE.length]);
  }
  for (let hour = startHour; hour < endHour; hour++) {
    const x = LABEL_WIDTH + (hour - startHour) * HOUR_WIDTH;
    parts.push(`<rect x="${x}" y="${headerY}" width="${HOUR_WIDTH}" height="48" fill="${hour % 2 ? '#6F647F' : '#7652C5'}"/>`);
    parts.push(text(x + HOUR_WIDTH / 2, headerY + 30, `${String(hour).padStart(2, '0')}:00 – ${String(hour + 1).padStart(2, '0')}:00`, 16, '#FFFFFF', 'text-anchor="middle"'));
  }
  let y = headerY + 48;
  const placements: { index: number; weekday: number; lane: number; x: number; y: number; width: number }[] = [];
  for (const [dayIndex, weekday] of DAY_ORDER.entries()) {
    const laneEnds: number[] = [];
    const entries = valid.filter(item => item.row.weekday === weekday).sort((a, b) => a.start - b.start || a.end - b.end);
    const cards = entries.map(item => {
      let lane = laneEnds.findIndex(end => end <= item.start);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = item.end;
      const cardWidth = Math.max(1, (item.end - item.start) / 60 * HOUR_WIDTH - 8);
      const row = item.row;
      const lines = [
        ...wrap(`${row.courseCode || 'ไม่ระบุรหัส'} · กลุ่ม ${row.section || '—'}`, cardWidth - 20),
        ...wrap(row.courseName || 'ยังไม่ระบุชื่อวิชา', cardWidth - 20),
        `${row.startTime} – ${row.endTime}`,
        ...wrap(`ห้อง ${row.roomName || '—'}`, cardWidth - 20),
        ...wrap(row.teacherName || 'ยังไม่ระบุผู้สอน', cardWidth - 20),
      ];
      return { ...item, lane, cardWidth, lines };
    });
    const laneHeights = Array.from({ length: Math.max(1, laneEnds.length) }, (_, lane) =>
      Math.max(cards.length ? 180 : 80, ...cards.filter(card => card.lane === lane).map(card => card.lines.length * 28 + 32)));
    const dayHeight = laneHeights.reduce((sum, height) => sum + height, 0);
    parts.push(`<rect x="${LABEL_WIDTH}" y="${y}" width="${width - LABEL_WIDTH}" height="${dayHeight}" fill="${dayIndex % 2 ? '#F5F3F7' : '#FDFCFE'}"/>`);
    parts.push(`<rect x="0" y="${y}" width="${LABEL_WIDTH}" height="${dayHeight}" fill="${dayIndex % 2 ? '#8B72BD' : '#7652C5'}"/>`);
    parts.push(text(LABEL_WIDTH / 2, y + dayHeight / 2 + 8, DAY_NAMES[weekday], 20, '#FFFFFF', 'text-anchor="middle"'));
    for (let hour = startHour; hour <= endHour; hour++) {
      const x = LABEL_WIDTH + (hour - startHour) * HOUR_WIDTH;
      parts.push(`<path d="M${x} ${y}v${dayHeight}" stroke="#E6DFEB"/>`);
    }
    for (const card of cards) {
      const x = LABEL_WIDTH + (card.start - startHour * 60) / 60 * HOUR_WIDTH + 4;
      const cardY = y + laneHeights.slice(0, card.lane).reduce((sum, height) => sum + height, 0) + 4;
      placements.push({ index: card.index, weekday, lane: card.lane, x, y: cardY, width: card.cardWidth });
      parts.push(`<rect x="${x}" y="${cardY}" width="${card.cardWidth}" height="${laneHeights[card.lane] - 8}" rx="10" fill="${courseColors.get(`${card.row.courseCode}:${card.row.section}`)}"/>`);
      const textTop = cardY + (laneHeights[card.lane] - 8 - card.lines.length * 28) / 2 + 20;
      card.lines.forEach((line, index) => parts.push(text(x + card.cardWidth / 2, textTop + index * 28, line, 18, '#282330', `text-anchor="middle"${index === 0 ? ' font-weight="600"' : ''}`)));
    }
    y += dayHeight;
    parts.push(`<path d="M0 ${y}h${width}" stroke="#FFFFFF" stroke-width="2"/>`);
  }
  const height = y + 24;
  return {
    width, height, placements, omitted: rows.length - valid.length,
    xml: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Kanit-Regular, sans-serif"><rect width="${width}" height="${height}" fill="#FFFFFF"/>${parts.join('')}</svg>`,
  };
}
