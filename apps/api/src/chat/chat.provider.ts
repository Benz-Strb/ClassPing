import { Injectable } from '@nestjs/common';
import type { ChatSource } from './chat.repo.js';

export const CHAT_PROVIDER = Symbol('CHAT_PROVIDER');
export interface ChatProvider {
  readonly model: string;
  readonly mock: boolean;
  embed(text: string): Promise<number[]>;
  answer(question: string, sources: ChatSource[]): Promise<string>;
}

// shortcut: deterministic trigrams for local wiring only; replace and reindex before semantic search.
@Injectable()
export class MockChatProvider implements ChatProvider {
  readonly model = 'mock-trigram-v1';
  readonly mock = true;
  async embed(text: string): Promise<number[]> {
    const value = text.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
    const vector = Array<number>(256).fill(0);
    for (let i = 0; i < Math.max(1, value.length - 2); i++) {
      let hash = 2166136261;
      for (const char of value.slice(i, i + 3)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
      vector[(hash >>> 0) % vector.length]++;
    }
    const norm = Math.hypot(...vector) || 1;
    return vector.map((v) => v / norm);
  }
  async answer(_question: string, sources: ChatSource[]): Promise<string> {
    if (!sources.length) return 'ไม่พบข้อมูลที่รองรับคำถามนี้ในแหล่งข้อมูลที่คุณมีสิทธิ์เข้าถึง';
    return 'โหมดทดสอบ: ข้อความจากแหล่งข้อมูล (ยังไม่เชื่อม LLM)\n\n' +
      sources.map((s, i) => `[${i + 1}] ${s.title}\n${s.content}`).join('\n\n');
  }
}
