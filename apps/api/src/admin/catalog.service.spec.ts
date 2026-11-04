import { MockChatProvider } from '../chat/chat.provider.js';
import { CatalogService } from './catalog.service.js';
import { parseCsv } from './catalog.csv.js';
import type { CatalogRepo } from './catalog.repo.js';
import { readFileSync } from 'node:fs';

const ID = '11111111-1111-4111-8111-111111111111';
const input = { code: 'CS', name: 'วิทยาการคอมพิวเตอร์', year: 2569, content: '', active: true };
function setup() {
  const repo = { saveKnowledge: vi.fn().mockImplementation(async (id, row) => ({ id: id ?? ID, ...row })), list: vi.fn().mockResolvedValue([]), insert: vi.fn().mockImplementation(async (_kind, rows) => rows.map((row: object) => ({ id: ID, ...row }))), update: vi.fn().mockResolvedValue(null) };
  return { repo, service: new CatalogService(repo as unknown as CatalogRepo, new MockChatProvider()) };
}

describe('Catalog validation and atomic import', () => {
  it('accepts curricula and rejects unsupported kinds before querying', async () => {
    const { repo, service } = setup();
    await expect(service.create('curricula', input)).resolves.toMatchObject({ code: 'CS', year: 2569 });
    await expect(service.list('users')).rejects.toMatchObject({ status: 400 });
    expect(repo.list).not.toHaveBeenCalled();
  });
  it('requires year and rejects invalid fields and unsafe knowledge URLs', async () => {
    const { repo, service } = setup();
    for (const body of [{ ...input, year: undefined }, { ...input, year: 1 }, { ...input, unknown: true }]) {
      await expect(service.create('curricula', body)).rejects.toMatchObject({ status: 400 });
    }
    await expect(service.create('knowledge', { name: 'FAQ', url: 'javascript:alert(1)', content: 'ข้อมูล', active: true })).rejects.toMatchObject({ status: 400 });
    await expect(service.create('knowledge', { name: 'FAQ', url: '', content: ' ', active: true })).rejects.toMatchObject({ status: 400 });
    expect(repo.insert).not.toHaveBeenCalled();
  });
  it('validates all CSV rows before one atomic repository insert', async () => {
    const { repo, service } = setup();
    const csv = 'code,name,year,content,active\nCS,Computer,2569,,true\nIT,IT,invalid,,true';
    await expect(service.importCsv('curricula', { csv })).rejects.toMatchObject({ status: 400, message: expect.stringContaining('3') });
    expect(repo.insert).not.toHaveBeenCalled();
    await service.importCsv('curricula', { csv: csv.replace('invalid', '2569') });
    expect(repo.insert).toHaveBeenCalledTimes(1);
    expect(repo.insert.mock.calls[0][1]).toHaveLength(2);
  });
  it('rejects duplicate keys, unexpected headers and invalid boolean values', async () => {
    const { repo, service } = setup();
    for (const csv of ['code,name,year\nCS,A,2569\nCS,B,2569', 'code,name,year,typo\nCS,A,2569,x', 'code,name,year,active\nCS,A,2569,yes']) {
      await expect(service.importCsv('curricula', { csv })).rejects.toMatchObject({ status: 400 });
    }
    expect(repo.insert).not.toHaveBeenCalled();
  });
  it('validates IDs and returns 404 for missing entries', async () => {
    const { repo, service } = setup();
    await expect(service.update('curricula', 'invalid', input)).rejects.toMatchObject({ status: 400 });
    expect(repo.update).not.toHaveBeenCalled();
    await expect(service.update('curricula', ID, input)).rejects.toMatchObject({ status: 404 });
  });
  it('stores reference categories and normalizes knowledge fields without fetching URLs', async () => {
    const { repo, service } = setup();
    await expect(service.create('reference', { code: 'faculty', name: 'คณะ', category: 'มหาวิทยาลัย', content: 'ข้อมูล', active: false }))
      .resolves.toMatchObject({ code: 'FACULTY', category: 'มหาวิทยาลัย', year: null, url: null, active: false });
    await expect(service.create('knowledge', { name: 'FAQ', url: 'https://example.invalid/faq', content: 'คำตอบ', active: true }))
      .resolves.toMatchObject({ code: null, category: null, year: null, url: 'https://example.invalid/faq' });
    repo.update.mockImplementationOnce(async (_kind, _id, row) => ({ id: ID, ...row }));
    await expect(service.update('knowledge', ID, { name: 'FAQ ใหม่', url: '', content: 'แก้ไข', active: false }))
      .resolves.toMatchObject({ name: 'FAQ ใหม่', url: null, active: false });
  });
  it('imports both shipped example files through the real validators', async () => {
    const { repo, service } = setup();
    for (const kind of ['curricula', 'reference']) {
      const csv = readFileSync(new URL(`../../../web/public/admin-${kind}-template.csv`, import.meta.url), 'utf8');
      await expect(service.importCsv(kind, { csv })).resolves.toEqual({ imported: 1 });
    }
    expect(repo.insert).toHaveBeenCalledTimes(2);
  });
});

describe('strict CSV', () => {
  it('supports BOM, CRLF, commas, quoted newlines and escaped quotes', () => {
    expect(parseCsv('\uFEFFcode,name\r\nCS,"A, ""B""\nC"\r\n')).toEqual([['code', 'name'], ['CS', 'A, "B"\nC']]);
  });
  it('rejects malformed quotes, excessive rows and oversized files', () => {
    for (const csv of ['a\n"unfinished', 'a\nab"c', 'a\n"ok"oops', 'a\n' + 'x\n'.repeat(501), 'x'.repeat(200001)]) {
      expect(() => parseCsv(csv)).toThrow();
    }
  });
});

describe('Catalog to chat retrieval', () => {
  const knowledge = { name: 'ทุนการศึกษา', content: 'ทุนการศึกษา '.repeat(200), url: 'https://www.dpu.ac.th', active: true };
  it('publishes through the atomic save and produces overlapping chunks', async () => {
    const { repo, service } = setup();
    await service.create('knowledge', knowledge);
    expect(repo.insert).not.toHaveBeenCalled();
    const [id, entry, chunks] = repo.saveKnowledge.mock.calls[0];
    expect(id).toBeNull();
    expect(entry).toMatchObject({ ...knowledge, content: knowledge.content.trim() });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]).toMatchObject({ content: knowledge.content.trim().slice(0, 1200), model: 'mock-trigram-v1' });
    expect(chunks[0].embedding).toHaveLength(256);
    expect(chunks[1].content).toBe(knowledge.content.trim().slice(1000, 2200));
  });
  it('updates by stable catalog id, and deactivates without embedding', async () => {
    const { repo, service } = setup();
    await service.update('knowledge', ID, { ...knowledge, active: false });
    expect(repo.saveKnowledge).toHaveBeenCalledWith(ID, expect.objectContaining({ active: false }), []);
    expect(repo.update).not.toHaveBeenCalled();
  });
  it('does not save catalog data if embedding fails', async () => {
    const { repo } = setup();
    const provider = new MockChatProvider();
    vi.spyOn(provider, 'embed').mockRejectedValue(new Error('embedding unavailable'));
    const service = new CatalogService(repo as unknown as CatalogRepo, provider);
    await expect(service.create('knowledge', knowledge)).rejects.toThrow('embedding unavailable');
    expect(repo.saveKnowledge).not.toHaveBeenCalled();
    expect(repo.insert).not.toHaveBeenCalled();
  });
  it('does not report a successful save when the transaction fails', async () => {
    const { repo, service } = setup();
    repo.saveKnowledge.mockRejectedValueOnce(new Error('transaction failed'));
    await expect(service.update('knowledge', ID, knowledge)).rejects.toThrow('transaction failed');
    expect(repo.update).not.toHaveBeenCalled();
  });
});
