import { Inject, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ADMIN } from '../supabase/supabase.module.js';
import { AppError } from '../common/app-error.js';

export interface ChatSource { id: string; title: string; content: string; url: string | null; score: number }
export interface KnowledgeInput {
  key: string; title: string; content: string; visibility: 'public' | 'course' | 'private';
  courseId?: string; ownerId?: string; url?: string;
}
export interface KnowledgeChunk { content: string; embedding: number[]; model: string }
function checked(error: unknown) {
  if (error) throw new AppError(503, 'KNOWLEDGE_UNAVAILABLE', 'อ่านหรือปรับปรุงแหล่งความรู้ไม่ได้ ลองใหม่อีกครั้ง');
}
@Injectable()
export class ChatRepository {
  constructor(@Inject(SUPABASE_ADMIN) private readonly db: SupabaseClient) {}
  async search(embedding: number[], userId: string | null, model: string): Promise<ChatSource[]> {
    const { data, error } = await this.db.rpc('search_chat_knowledge', {
      query_embedding: embedding, viewer_id: userId, embedding_model: model,
    });
    checked(error);
    return (data ?? []) as ChatSource[];
  }
  async replace(input: KnowledgeInput, chunks: KnowledgeChunk[]) {
    const { error } = await this.db.rpc('replace_chat_knowledge', { source: input, chunks });
    checked(error);
    return { key: input.key, chunks: chunks.length };
  }
  async remove(key: string) {
    const { error } = await this.db.from('chat_knowledge_sources').delete().eq('source_key', key);
    checked(error);
    return { key };
  }
}
