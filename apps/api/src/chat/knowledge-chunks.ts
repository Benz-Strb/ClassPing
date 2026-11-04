import type { ChatProvider } from './chat.provider.js';
import type { KnowledgeChunk } from './chat.repo.js';

export async function knowledgeChunks(content: string, provider: ChatProvider): Promise<KnowledgeChunk[]> {
  const chunks: KnowledgeChunk[] = [];
  for (let start = 0; start < content.length; start += 1000) {
    const part = content.slice(start, start + 1200);
    chunks.push({ content: part, embedding: await provider.embed(part), model: provider.model });
    if (start + 1200 >= content.length) break;
  }
  return chunks;
}
