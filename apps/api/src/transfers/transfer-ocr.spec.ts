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
});
