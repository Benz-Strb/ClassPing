import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { knowledgeChunks } from './knowledge-chunks.js';
import { parseBody } from '../common/validate.js';
import type { AppUser } from '../users/users.service.js';
import { ChatRepository } from './chat.repo.js';
import { CHAT_PROVIDER, type ChatProvider } from './chat.provider.js';

const question = z.object({ message: z.string().trim().min(1).max(2000) });
const knowledge = z.object({
  key: z.string().trim().min(1).max(150).refine((key) => !key.startsWith('catalog:'), 'แก้แหล่งความรู้นี้ผ่านหน้าผู้ดูแล'), title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(20000),
  visibility: z.enum(['public', 'course', 'private']),
  courseId: z.uuid().optional(), ownerId: z.uuid().optional(),
  url: z.url().refine((v) => /^https?:\/\//i.test(v)).optional(),
}).refine((v) => (v.visibility === 'course' ? !!v.courseId && !v.ownerId :
  v.visibility === 'private' ? !!v.ownerId && !v.courseId : !v.ownerId && !v.courseId),
{ message: 'ขอบเขตแหล่งข้อมูลต้องตรงกับ courseId หรือ ownerId' });
@Injectable()
export class ChatService {
  constructor(private readonly repo: ChatRepository, @Inject(CHAT_PROVIDER) private readonly provider: ChatProvider) {}
  async ask(body: unknown, user: AppUser | null) {
    const { message } = parseBody(question, body);
    const embedding = await this.provider.embed(message, 'query');
    const viewerId = user?.role === 'student' || user?.role === 'teacher' ? user.id : null;
    const sources = await this.repo.search(embedding, viewerId, this.provider.model);
    const answer = sources.length ? await this.provider.answer(message, sources) :
      'ไม่พบข้อมูลที่รองรับคำถามนี้ในแหล่งข้อมูลที่คุณมีสิทธิ์เข้าถึง';
    return { answer, sources, mock: this.provider.mock };
  }
  async ingest(body: unknown) {
    const input = parseBody(knowledge, body);
    const chunks = await knowledgeChunks(input.content, this.provider);
    return this.repo.replace(input, chunks);
  }
  remove(key: string) {
    return this.repo.remove(parseBody(z.string().trim().min(1).max(150).refine((value) => !value.startsWith('catalog:')), key));
  }
}
