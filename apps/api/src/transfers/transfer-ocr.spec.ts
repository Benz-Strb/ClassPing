import { describe, expect, it } from 'vitest';
import { extractTransferDraft, suggestItems } from './transfer-ocr.js';
import type { CurriculumDocument, TransferRequest } from './transfers.types.js';
const source = {
  sourceCode: 'CS101',
  sourceName: 'Programming',
  credits: 3,
  grade: 'B',
};
const doc = {
  id: 'doc',
  curriculumId: 'curr',
  courses: [{ ...source, sourceCode: 'IT101' }],
} as CurriculumDocument;

describe('transfer OCR and matching', () => {
  it('reads Thai metadata, Markdown rows, Thai digits and credit tuples', () => {
    const draft = extractTransferDraft(
      [
        'มหาวิทยาลัยทดสอบ',
        'สาขาวิชา: วิทยาการคอมพิวเตอร์',
        '| CS101 | Programming | ๓(๓-๐-๖) | B |',
        'CS102',
        'Data Structures',
        '3',
      ].map((text) => ({ text })),
    );
    expect(draft.sourceInstitution).toBe('มหาวิทยาลัยทดสอบ');
    expect(draft.sourceMajor).toBe('วิทยาการคอมพิวเตอร์');
    expect(draft.courses).toEqual([
      source,
      {
        sourceCode: 'CS102',
        sourceName: 'Data Structures',
        credits: 3,
        grade: '',
      },
    ]);
  });
  it('reads HTML tables returned by the live OCR provider', () => {
    const result = extractTransferDraft([{ text: '<table><tr><td>Course Code</td><td>Course Name</td><td>Credits</td></tr><tr><td>CS101</td><td>Programming</td><td>3</td></tr><tr><td>CS102</td><td>Data Structures</td><td>3</td></tr></table>' }]);
    expect(result.courses.map(c => c.sourceCode)).toEqual(['CS101', 'CS102']);
  });
  it('does not fabricate courses from missing OCR data', () => {
    expect(
      extractTransferDraft([{ text: 'unreadable document' }]).courses,
    ).toEqual([]);
  });
  it('suggests exact curriculum name and sufficient credits only', () => {
    expect(
      suggestItems([source], 'School', 'CS', doc, [], [])[0].match?.targetCode,
    ).toBe('IT101');
    expect(
      suggestItems([{ ...source, credits: 2 }], 'School', 'CS', doc, [], [])[0]
        .match,
    ).toBeNull();
    expect(
      suggestItems(
        [{ ...source, sourceName: 'Something else' }],
        'School',
        'CS',
        doc,
        [],
        [],
      )[0].match,
    ).toBeNull();
  });
  it('does not choose between ambiguous curriculum matches', () => {
    const ambiguous = {
      ...doc,
      courses: [...doc.courses!, { ...source, sourceCode: 'IT102' }],
    };
    expect(
      suggestItems([source], 'School', 'CS', ambiguous, [], [])[0].match,
    ).toBeNull();
  });
  it('reuses only approved institution/major/course/target history', () => {
    const match = suggestItems([source], 'School', 'CS', doc, [], [])[0].match;
    const previous = {
      id: 'prior',
      curriculumId: 'curr',
      sourceInstitution: 'SCHOOL',
      sourceMajor: 'CS',
      reviewedAt: '2026-11-08',
      items: [{ ...source, id: 'item', match, decision: 'approved' }],
    } as TransferRequest;
    expect(
      suggestItems([source], ' school ', 'CS', doc, [], [previous])[0]
        .previousApproval?.requestId,
    ).toBe('prior');
    for (const changed of [
      { sourceInstitution: 'Other' },
      { sourceMajor: 'Other' },
      { curriculumId: 'other' },
      { reviewedAt: null },
      { items: [{ ...previous.items[0], decision: 'rejected' }] },
    ]) {
      expect(
        suggestItems(
          [source],
          'School',
          'CS',
          doc,
          [],
          [{ ...previous, ...changed } as TransferRequest],
        )[0].previousApproval,
      ).toBeUndefined();
    }
    expect(
      suggestItems(
        [{ ...source, credits: 2 }],
        'School',
        'CS',
        doc,
        [],
        [previous],
      )[0].previousApproval,
    ).toBeUndefined();
  });
  it('extracts year 1–4 headings without treating the curriculum calendar year as a study year', () => {
    const draft = extractTransferDraft(['หลักสูตร พ.ศ. 2569', 'ชั้นปีที่ 1', 'CS101 Programming 3', 'ชั้นปีที่ 2', 'CS201 Data Structures 3', 'ปีที่ 3', 'CS301 Networks 3', 'Year 4', 'CS401 Project 3'].map(text => ({ text })));
    expect(draft.courses.map(course => course.studyYear)).toEqual([1, 2, 3, 4]);
    expect(extractTransferDraft([{ text: 'CS101 Programming 3' }]).courses[0].studyYear).toBeUndefined();
  });
  it('prepares automatic approval only for identical approved credits and grade at the same institution', () => {
    const match = suggestItems([source], 'School', 'CS', doc, [], [])[0].match;
    const previous = { id: 'prior', curriculumId: 'curr', sourceInstitution: 'School', sourceMajor: 'CS', reviewedAt: '2026-11-08', items: [{ ...source, id: 'item', match, decision: 'approved' }] } as TransferRequest;
    expect(suggestItems([source], 'School', 'CS', doc, [], [previous])[0].autoApprovalSuggested).toBe(true);
    expect(suggestItems([source], 'School', '', doc, [], [previous])[0].autoApprovalSuggested).toBe(true);
    for (const patch of [{ grade: '' }, { grade: 'C' }, { grade: 'A' }, { credits: 4 }]) {
      expect(suggestItems([{ ...source, ...patch }], 'School', 'CS', doc, [], [previous])[0].autoApprovalSuggested).toBeUndefined();
    }
    expect(suggestItems([source], 'New School', 'CS', doc, [], [previous])[0].autoApprovalSuggested).toBeUndefined();
  });
  it('does not automatically approve when past approvals disagree on the target', () => {
    const target2 = { ...source, sourceCode: 'IT102', sourceName: 'Other course' };
    const curriculum = { ...doc, courses: [...doc.courses!, target2] };
    const match = suggestItems([source], 'School', 'CS', doc, [], [])[0].match!;
    const past = (targetCode: string, targetName: string) => ({ id: targetCode, curriculumId: 'curr', sourceInstitution: 'School', sourceMajor: 'CS', reviewedAt: '2026-11-08', items: [{ ...source, id: 'item', match: { ...match, targetCode, targetName }, decision: 'approved' }] }) as TransferRequest;
    expect(suggestItems([source], 'School', 'CS', curriculum, [], [past('IT101', 'Programming'), past('IT102', 'Other course')])[0].autoApprovalSuggested).toBeUndefined();
  });

});
