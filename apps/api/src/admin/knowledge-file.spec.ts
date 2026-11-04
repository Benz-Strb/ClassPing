import PDFDocument from 'pdfkit';
import { readFile } from 'node:fs/promises';
import { extractKnowledgeFile, KNOWLEDGE_FILE_LIMIT } from './knowledge-file.js';

const file = (name: string, text: string) => ({ originalname: name, buffer: Buffer.from(text) });
describe('Knowledge file extraction', () => {
  it('extracts Thai text from DOCX', async () => {
    const buffer = await readFile(new URL('../../test/fixtures/knowledge.docx', import.meta.url));
    await expect(extractKnowledgeFile({ originalname: 'ทุน.docx', buffer })).resolves.toEqual({ name: 'ทุน', content: 'ทุนการศึกษา' });
  });
  it('reads Thai UTF-8 text and CSV without changing table delimiters', async () => {
    await expect(extractKnowledgeFile(file('ทุน.TXT', '\ufeffทุนการศึกษา\r\nรายละเอียด'))).resolves.toEqual({ name: 'ทุน', content: 'ทุนการศึกษา\nรายละเอียด' });
    await expect(extractKnowledgeFile(file('fees.csv', 'คณะ,ค่าเทอม\nไอที,30000'))).resolves.toMatchObject({ content: 'คณะ,ค่าเทอม\nไอที,30000' });
  });
  it('extracts an actual PDF', async () => {
    const buffer = await new Promise<Buffer>((resolve) => {
      const doc = new PDFDocument();
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.text('University scholarship information'); doc.end();
    });
    await expect(extractKnowledgeFile({ originalname: 'scholarship.pdf', buffer })).resolves.toMatchObject({ content: expect.stringContaining('University scholarship information') });
  });
  it('rejects missing, unsupported, malformed, empty and oversized input', async () => {
    await expect(extractKnowledgeFile()).rejects.toMatchObject({ code: 'FILE_REQUIRED' });
    await expect(extractKnowledgeFile(file('data.exe', 'test'))).rejects.toMatchObject({ code: 'FILE_TYPE' });
    for (const name of ['broken.pdf', 'broken.docx']) {
      await expect(extractKnowledgeFile(file(name, 'not a document'))).rejects.toMatchObject({ code: 'FILE_UNREADABLE' });
    }
    await expect(extractKnowledgeFile(file('empty.txt', '  '))).rejects.toMatchObject({ code: 'FILE_EMPTY' });
    await expect(extractKnowledgeFile({ originalname: 'bad.txt', buffer: Buffer.from([0xff]) })).rejects.toMatchObject({ code: 'FILE_UNREADABLE' });
    await expect(extractKnowledgeFile(file('long.txt', 'a'.repeat(50_001)))).rejects.toMatchObject({ code: 'CONTENT_TOO_LONG' });
    await expect(extractKnowledgeFile({ originalname: 'large.txt', buffer: Buffer.alloc(KNOWLEDGE_FILE_LIMIT + 1) })).rejects.toMatchObject({ status: 413 });
  });
});
