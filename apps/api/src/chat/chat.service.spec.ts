import { describe, expect, it, vi } from 'vitest';
import { ChatService } from './chat.service.js';
import { MockChatProvider } from './chat.provider.js';
import type { ChatRepository } from './chat.repo.js';
import type { AppUser } from '../users/users.service.js';

const student = { id: 'student-a', role: 'student' } as AppUser;
const source = { id: 'chunk', title: 'ทุน', content: 'สมัครทุนที่ฝ่ายกิจการนักศึกษา', url: null, score: 0.9 };
function setup() {
  const repo = { search: vi.fn().mockResolvedValue([source]), replace: vi.fn(), remove: vi.fn() };
  return { repo, service: new ChatService(repo as unknown as ChatRepository, new MockChatProvider()) };
}
describe('ChatService', () => {
  it('always searches anonymous requests with null identity', async () => {
    const { service, repo } = setup();
    const result = await service.ask({ message: 'สมัครทุน', userId: student.id }, null);
    expect(repo.search).toHaveBeenCalledWith(expect.any(Array), null, 'mock-trigram-v1');
    expect(result.mock).toBe(true);
    expect(result.sources[0].id).toBe('chunk');
    expect(result.answer).toContain(source.content);
  });
  it('uses authenticated server identity for private retrieval', async () => {
    const { service, repo } = setup();
    await service.ask({ message: 'กำหนดส่ง', userId: 'other' }, student);
    expect(repo.search).toHaveBeenCalledWith(expect.any(Array), student.id, 'mock-trigram-v1');
  });
  it('abstains when no supporting source exists', async () => {
    const { service, repo } = setup(); repo.search.mockResolvedValue([]);
    const result = await service.ask({ message: 'ไม่มีข้อมูล' }, null);
    expect(result.answer).toContain('ไม่พบข้อมูล');
    expect(result.sources).toEqual([]);
  });
  it('rejects blank or excessive questions', async () => {
    const { service, repo } = setup();
    await expect(service.ask({ message: ' ' }, null)).rejects.toThrow();
    await expect(service.ask({ message: 'ก'.repeat(2001) }, null)).rejects.toThrow();
    expect(repo.search).not.toHaveBeenCalled();
  });
  it('uses the shared Thai BAD_REQUEST validation envelope', async () => {
    const { service } = setup();
    await expect(service.ask({ message: 123 }, null)).rejects.toMatchObject({
      code: 'BAD_REQUEST', message: 'ข้อมูลที่ส่งมาไม่ถูกต้อง',
    });
  });
  it('chunks and replaces a stable source rather than appending duplicates', async () => {
    const { service, repo } = setup();
    await service.ingest({ key: 'faq', title: 'FAQ', content: 'ก'.repeat(1500), visibility: 'public' });
    expect(repo.replace).toHaveBeenCalledWith(expect.objectContaining({ key: 'faq', visibility: 'public' }), expect.arrayContaining([expect.objectContaining({ model: 'mock-trigram-v1' })]));
    expect(repo.replace.mock.calls[0][1]).toHaveLength(2);
  });
  it('requires a course for course sources and an owner for private sources', async () => {
    const { service } = setup();
    await expect(service.ingest({ key: 'bad', title: 'x', content: 'x', visibility: 'course' })).rejects.toThrow();
    await expect(service.ingest({ key: 'bad', title: 'x', content: 'x', visibility: 'private' })).rejects.toThrow();
  });
});

describe('Catalog source ownership', () => {
  it('rejects direct ingestion and deletion of catalog managed keys', async () => {
    const { service, repo } = setup();
    await expect(service.ingest({ key: 'catalog:entry', title: 'FAQ', content: 'Text', visibility: 'public' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(() => service.remove('catalog:entry')).toThrow();
    expect(repo.replace).not.toHaveBeenCalled();
    expect(repo.remove).not.toHaveBeenCalled();
  });
});
