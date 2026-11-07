import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeminiChatProvider, createChatProvider } from './gemini.provider.js';

const source = { id: 'private-id', title: 'ทุน', content: 'สมัครทุนที่ฝ่ายกิจการนักศึกษา', url: null, score: 0.9 };
function setup(body: unknown, status = 200) {
  const fetcher = vi.fn().mockResolvedValue(Response.json(body, { status }));
  vi.stubGlobal('fetch', fetcher);
  return { fetcher, provider: new GeminiChatProvider('test-secret') };
}
afterEach(() => { vi.unstubAllGlobals(); });

describe('Gemini provider', () => {
  it('selects Gemini only when the server key is configured', () => {
    expect(createChatProvider({}).mock).toBe(true);
    expect(createChatProvider({ GEMINI_API_KEY: ' ' }).mock).toBe(true);
    expect(createChatProvider({ GEMINI_API_KEY: 'key' })).toBeInstanceOf(GeminiChatProvider);
    expect(createChatProvider({ GEMINI_API_KEY: 'key', GEMINI_EMBEDDING_MODEL: 'gemini-embedding-2' }).model).toBe('gemini-embedding-2:256:retrieval-v1');
    expect(() => createChatProvider({ GEMINI_API_KEY: 'key', GEMINI_MODEL: '../model' })).toThrow();
  });

  it('normalizes 256-dimensional document embeddings and keeps keys out of URLs', async () => {
    const values = Array<number>(256).fill(2);
    const { provider, fetcher } = setup({ embedding: { values } });
    const embedding = await provider.embed('ทุน');
    expect(Math.hypot(...embedding)).toBeCloseTo(1);
    expect(embedding).toHaveLength(256);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent');
    expect(init.headers['x-goog-api-key']).toBe('test-secret');
    expect(JSON.parse(init.body)).toMatchObject({ taskType: 'RETRIEVAL_DOCUMENT', outputDimensionality: 256 });
  });

  it('uses query task type for retrieval', async () => {
    const { provider, fetcher } = setup({ embedding: { values: Array<number>(256).fill(1) } });
    await provider.embed('สมัครทุนอย่างไร', 'query');
    expect(JSON.parse(fetcher.mock.calls[0][1].body).taskType).toBe('RETRIEVAL_QUERY');
  });

  it.each([{ values: [] }, { values: Array<number>(768).fill(1) }, { values: Array<number>(256).fill(0) }, { values: ['wrong'] }])('rejects invalid embeddings %#', async ({ values }) => {
    const { provider } = setup({ embedding: { values } });
    await expect(provider.embed('ทุน')).rejects.toMatchObject({ code: 'GEMINI_EMBEDDING' });
  });

  it('answers using only retrieved sources, excluding thoughts and internal identifiers', async () => {
    const { provider, fetcher } = setup({ candidates: [{ finishReason: 'STOP', content: { parts: [
      { text: 'internal reasoning', thought: true }, { text: 'สมัครทุนที่ฝ่ายกิจการนักศึกษา' },
    ] } }] });
    await expect(provider.answer('สมัครทุนที่ไหน', [source])).resolves.toBe('สมัครทุนที่ฝ่ายกิจการนักศึกษา');
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(fetcher.mock.calls[0][0]).toContain('/gemini-3.1-flash-lite:generateContent');
    expect(body.systemInstruction.parts[0].text).toContain('sources ที่ให้เท่านั้น');
    expect(body.systemInstruction.parts[0].text).toContain('ไม่ใส่เลขอ้างอิงในวงเล็บเหลี่ยม');
    expect(JSON.parse(body.contents[0].parts[0].text)).toEqual({ question: 'สมัครทุนที่ไหน', sources: [{ title: source.title, content: source.content }] });
    expect(fetcher.mock.calls[0][1].body).not.toContain('private-id');
  });

  it('abstains without calling Gemini when no sources are available', async () => {
    const { provider, fetcher } = setup({});
    await expect(provider.answer('ทุน', [])).resolves.toContain('ไม่พบข้อมูล');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('uses the same model for conversational study with only read-only Google Search enabled', async () => {
    const html = '<div>Google Search suggestions</div>';
    const {provider, fetcher} = setup({candidates: [{finishReason: 'STOP', content: {parts: [{thought: true, text: 'hidden'}, {text: 'อธิบายการเรียน'}]}, groundingMetadata: {
      webSearchQueries: ['learning'], searchEntryPoint: {renderedContent: html},
      groundingChunks: [{web: {uri: 'https://example.edu/lesson', title: 'บทเรียน'}}, {web: {uri: 'https://example.edu/lesson'}}, {web: {uri: 'javascript:alert(1)'}}, {web: {uri: 'not-a-url'}}],
    }}]});
    const result = await provider.study('อธิบายเพิ่ม', [{question: 'คำถามก่อน', answer: 'คำตอบก่อน'}]);
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(fetcher.mock.calls[0][0]).toContain('/gemini-3.1-flash-lite:generateContent');
    expect(body.tools).toEqual([{google_search: {}}]);
    expect(body.contents).toEqual([{role: 'user', parts: [{text: 'คำถามก่อน'}]}, {role: 'model', parts: [{text: 'คำตอบก่อน'}]}, {role: 'user', parts: [{text: 'อธิบายเพิ่ม'}]}]);
    expect(body.systemInstruction.parts[0].text).toContain('ตอบแชทเป็นข้อความเท่านั้น');
    expect(body.systemInstruction.parts[0].text).toContain('ไม่มีสิทธิ์อ่านเอกสารที่อัปโหลด');
    expect(result).toMatchObject({answer: 'อธิบายการเรียน', webGrounded: true, searchEntryPoint: html});
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].url).toBe('https://example.edu/lesson');
    expect(JSON.stringify(body)).not.toContain('private-id');
  });

  it('answers general learning questions without falsely marking them as web-grounded', async () => {
    const {provider} = setup({candidates: [{finishReason: 'STOP', content: {parts: [{text: '2 + 2 = 4'}]}}]});
    await expect(provider.study('2 + 2', [])).resolves.toMatchObject({answer: '2 + 2 = 4', sources: [], webGrounded: false});
  });

  it('does not execute or return function calls as study answers', async () => {
    const {provider, fetcher} = setup({candidates: [{finishReason: 'STOP', content: {parts: [{functionCall: {name: 'delete_all_records'}}]}}]});
    await expect(provider.study('แก้ข้อมูลให้', [])).rejects.toMatchObject({code: 'GEMINI_RESPONSE'});
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([{}, { candidates: [] }, { candidates: [{ finishReason: 'SAFETY' }] },
    { candidates: [{ finishReason: 'STOP', content: { parts: [] } }] },
    { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: 'incomplete' }] } }] },
  ])('handles blocked, empty or incomplete responses %#', async (body) => {
    const { provider } = setup(body);
    await expect(provider.answer('ทุน', [source])).rejects.toMatchObject({ code: 'GEMINI_RESPONSE' });
  });

  it.each([[429, 'GEMINI_QUOTA'], [403, 'GEMINI_CONFIG'], [404, 'GEMINI_CONFIG'], [500, 'GEMINI_UNAVAILABLE']] as const)(
    'maps HTTP %s without exposing provider errors or keys', async (status, code) => {
      const { provider } = setup({ error: { message: 'test-secret' } }, status);
      await expect(provider.embed('ทุน')).rejects.toMatchObject({ code });
      await expect(provider.embed('ทุน')).rejects.not.toThrow('test-secret');
    },
  );

  it('handles network failure without exposing request details', async () => {
    const { provider, fetcher } = setup({});
    fetcher.mockRejectedValue(new Error('test-secret'));
    await expect(provider.embed('ทุน')).rejects.toMatchObject({ code: 'GEMINI_UNAVAILABLE' });
  });
});
