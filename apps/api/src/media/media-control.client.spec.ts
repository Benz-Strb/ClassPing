import type { AppConfig } from '../config/config.js';
import { HttpMediaControl } from './media-control.client.js';

const config = {
  mediaApiUrl: 'http://127.0.0.1:9997',
  mediaServerSecret: 's'.repeat(32),
} as AppConfig;

type Call = { url: string; method: string; auth: string | null };

function stubFetch(respond: (url: string) => { status: number; body?: unknown }) {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    calls.push({
      url,
      method: init.method ?? 'GET',
      auth: new Headers(init.headers).get('authorization'),
    });
    const { status, body } = respond(url);
    return new Response(body === undefined ? null : JSON.stringify(body), { status });
  });
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HttpMediaControl', () => {
  it('รวมสาย RTSP กับ WebRTC พร้อมส่ง Bearer secret', async () => {
    const calls = stubFetch((url) =>
      url.includes('/rtsp/')
        ? {
            status: 200,
            body: { items: [{ id: 'r1', state: 'publish', path: 'cam/a', query: 'token=x' }] },
          }
        : { status: 200, body: { items: [{ id: 'w1', state: 'read', path: 'cam/a' }] } },
    );
    await expect(new HttpMediaControl(config).list()).resolves.toEqual([
      { kind: 'rtsp', id: 'r1', state: 'publish', path: 'cam/a' },
      { kind: 'webrtc', id: 'w1', state: 'read', path: 'cam/a' },
    ]);
    expect(calls.map((c) => c.url)).toEqual([
      'http://127.0.0.1:9997/v3/rtsp/sessions/list',
      'http://127.0.0.1:9997/v3/webrtc/sessions/list',
    ]);
    expect(calls.every((c) => c.auth === `Bearer ${'s'.repeat(32)}`)).toBe(true);
  });

  it('MediaMTX ตอบไม่สำเร็จ throw', async () => {
    stubFetch(() => ({ status: 401 }));
    await expect(new HttpMediaControl(config).list()).rejects.toThrow('401');
  });

  it('ตัดสายด้วย POST kick ตามชนิด ถ้าสายหลุดไปเองแล้ว (404) ไม่ throw', async () => {
    const calls = stubFetch((url) => ({ status: url.endsWith('/gone') ? 404 : 200 }));
    const control = new HttpMediaControl(config);
    await control.kick({ kind: 'rtsp', id: 'r1', state: 'publish', path: 'cam/a' });
    await control.kick({ kind: 'webrtc', id: 'gone', state: 'read', path: 'cam/a' });
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'POST http://127.0.0.1:9997/v3/rtsp/sessions/kick/r1',
      'POST http://127.0.0.1:9997/v3/webrtc/sessions/kick/gone',
    ]);
  });
});
