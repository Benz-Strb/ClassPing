import type {
  TransferItem,
  TransferMapping,
  TransferRequest,
  CurriculumDocument,
} from './transfers.types.js';

export interface ExtractedCourse {
  sourceCode: string;
  sourceName: string;
  credits: number;
  grade: string;
}
export interface TransferDraft {
  sourceInstitution: string;
  sourceMajor: string;
  courses: ExtractedCourse[];
  ocrText: string;
  warnings: string[];
}
export const normalize = (text: string) =>
  text.normalize('NFKC').toUpperCase().replace(/\s+/gu, ' ').trim();
const nameKey = (text: string) =>
  normalize(text).replace(/[^\p{L}\p{N}]/gu, '');

export function extractTransferDraft(lines: { text: string }[]): TransferDraft {
  const text = lines
    .map((l) => l.text)
    .join('\n')
    .slice(0, 200_000)
    .replace(/[๐-๙]/gu, (n) => String(n.charCodeAt(0) - 0x0e50));
  const rows = text
    .replace(/<\/tr\s*>/giu, '\n')
    .replace(/<\/t[dh]\s*>/giu, ' | ')
    .replace(/<br\s*\/?\s*>/giu, ' ')
    .replace(/&nbsp;|&#160;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .split('\n')
    .map((l) =>
      l
        .replace(/<[^>]*>/gu, ' ')
        .replace(/[*_`]/gu, '')
        .trim(),
    )
    .filter(Boolean);
  const institution = rows.find(
    (l) =>
      /(?:มหาวิทยาลัย|วิทยาลัย|สถาบัน|university|college|institute)/iu.test(
        l,
      ) && !/หน่วยกิต|credits/iu.test(l),
  );
  const major = rows.find((l) =>
    /(?:สาขาวิชา|สาขา\s*[:：]|major\s*[:：]|program(?:me)?\s*[:：])/iu.test(l),
  );
  const courses = new Map<string, ExtractedCourse>();
  for (let i = 0; i < rows.length; i++) {
    let line = rows[i]
      .replace(/^\|\s*/u, '')
      .replace(/\s*\|$/u, '')
      .replace(/\s*\|\s*/gu, '  ');
    // Paddle can return the code, name and credits as separate text boxes.
    if (
      /^[A-Zก-๙]{0,6}\s*\d{3,8}(?:[- ]?[A-Z0-9]{1,3})?$/iu.test(line) &&
      rows[i + 1]
    ) {
      line += `  ${rows[i + 1]}  ${rows[i + 2] ?? ''}`;
    }
    const parsed = line.match(
      /^([A-Zก-๙]{0,6}\s*\d{3,8}(?:-[A-Z0-9]{1,3})?)\s+(.+?)\s+(\d{1,2}(?:\.5)?)(?:\s*\([^)]*\))?(?:\s+(?:หน่วยกิต|credits?))?(?:\s+([A-F][+-]?|S|U|W|I|P|NP|\d\.\d{1,2}))?\s*$/iu,
    );
    if (!parsed) continue;
    const credits = Number(parsed[3]);
    if (credits < 0.5 || credits > 30 || !/[\p{L}]/u.test(parsed[2])) continue;
    const sourceCode = normalize(parsed[1]).replace(/\s/gu, '');
    if (!courses.has(sourceCode) && courses.size < 1000)
      courses.set(sourceCode, {
        sourceCode,
        sourceName: parsed[2].trim().slice(0, 200),
        credits,
        grade: parsed[4] ?? '',
      });
  }
  const warnings: string[] = [
    'ตรวจสอบข้อมูล OCR เทียบกับเอกสารต้นฉบับก่อนยืนยัน',
  ];
  if (!institution) warnings.push('ไม่พบชื่อสถาบัน กรุณาระบุเอง');
  if (!major) warnings.push('ไม่พบสาขา กรุณาระบุเอง');
  if (!courses.size)
    warnings.push('อ่านรายวิชาไม่ครบ กรุณาเพิ่มรายวิชาจากเอกสาร');
  if (courses.size > 50)
    warnings.push(
      'คำขอนักศึกษารองรับ 50 วิชาต่อครั้ง หากมีมากกว่านี้ให้แยกคำขอ',
    );
  return {
    sourceInstitution: (institution ?? '')
      .replace(/^(?:สถาบัน(?:เดิม)?|institution)\s*[:：]\s*/iu, '')
      .slice(0, 200),
    sourceMajor: (major ?? '')
      .replace(/^.*?(?:สาขาวิชา|สาขา|major|program(?:me)?)\s*[:：]?\s*/iu, '')
      .slice(0, 200),
    courses: [...courses.values()],
    ocrText: text,
    warnings,
  };
}

export function suggestItems(
  courses: ExtractedCourse[],
  institution: string,
  major: string,
  doc: CurriculumDocument,
  mappings: TransferMapping[],
  history: TransferRequest[],
): Omit<TransferItem, 'id'>[] {
  return courses.map((course) => {
    const previous = major
      ? history
          .flatMap((request) =>
            request.curriculumId === doc.curriculumId &&
            normalize(request.sourceInstitution) === normalize(institution) &&
            normalize(request.sourceMajor ?? '') === normalize(major) &&
            request.reviewedAt
              ? request.items
                  .filter(
                    (item) =>
                      item.decision === 'approved' &&
                      item.match &&
                      normalize(item.sourceCode) ===
                        normalize(course.sourceCode) &&
                      nameKey(item.sourceName) === nameKey(course.sourceName) &&
                      course.credits >= item.match.minCredits,
                  )
                  .map((item) => ({ request, item }))
              : [],
          )
          .find(({ item }) =>
            (doc.courses ?? []).some(
              (target) =>
                target.sourceCode === item.match!.targetCode &&
                target.sourceName === item.match!.targetName &&
                target.credits === item.match!.targetCredits,
            ),
          )
      : undefined;
    if (previous)
      return {
        ...course,
        match: {
          ...previous.item.match!,
          minCredits: previous.item.match!.minCredits,
        },
        matchSource: 'history',
        previousApproval: {
          requestId: previous.request.id,
          reviewedAt: previous.request.reviewedAt!,
        },
      };
    const mapping = mappings.find(
      (m) =>
        m.active &&
        m.curriculumId === doc.curriculumId &&
        normalize(m.sourceInstitution) === normalize(institution) &&
        normalize(m.sourceCode) === normalize(course.sourceCode) &&
        course.credits >= m.minCredits,
    );
    if (mapping) return { ...course, match: mapping, matchSource: 'mapping' };
    const targets = (doc.courses ?? []).filter(
      (target) =>
        nameKey(target.sourceName) === nameKey(course.sourceName) &&
        course.credits >= target.credits,
    );
    if (targets.length !== 1) return { ...course, match: null };
    const target = targets[0];
    return {
      ...course,
      match: {
        id: doc.id,
        curriculumId: doc.curriculumId,
        sourceInstitution: normalize(institution),
        sourceCode: normalize(course.sourceCode),
        sourceName: course.sourceName,
        minCredits: target.credits,
        targetCode: target.sourceCode,
        targetName: target.sourceName,
        targetCredits: target.credits,
        active: true,
      },
      matchSource: 'curriculum',
    };
  });
}
