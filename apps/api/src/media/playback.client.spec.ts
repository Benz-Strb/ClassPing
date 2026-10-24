import type { AppConfig } from '../config/config.js';
import { HttpPlaybackClient } from './playback.client.js';

const config = {
  mediaPlaybackUrl: 'http://127.0.0.1:9996',
  mediaServerSecret: 's'.repeat(32),
} as AppConfig;

function stubFetch(respond: (url: string) => Response | Promise<Response>) {
  const calls: { url: string; auth: string | null }[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    calls.push({ url, auth: new Headers(init.headers).get('authorization') });
    return respond(url);
  });
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return (error as { code: string }).code;
  }
  throw new Error('คาดว่าจะ throw แต่ไม่ throw');
}

describe('HttpPlaybackClient.list', () => {
  it('ส่ง path และช่วงเวลาแบบ RFC3339 พร้อม Bearer แล้วแปลงผล', async () => {
    const calls = stubFetch(
      () =>
        new Response(
          JSON.stringify([{ start: '2026-10-24T10:11:45.44181Z', duration: 567.4, url: 'x' }]),
        ),
    );
    const segments = await new HttpPlaybackClient(config).list(
      'cam/c1',
      new Date('2026-10-24T10:00:00Z'),
      new Date('2026-10-24T11:00:00Z'),
    );
    expect(segments).toEqual([{ start: new Date('2026-10-24T10:11:45.44181Z'), duration: 567.4 }]);
    const url = new URL(calls[0].url);
    expect(url.pathname).toBe('/list');
    expect(url.searchParams.get('path')).toBe('cam/c1');
    expect(url.searchParams.get('start')).toBe('2026-10-24T10:00:00.000Z');
    expect(url.searchParams.get('end')).toBe('2026-10-24T11:00:00.000Z');
    expect(calls[0].auth).toBe(`Bearer ${'s'.repeat(32)}`);
  });

  it('ยังไม่มีไฟล์ของ path นี้ (MediaMTX ตอบ 400/404) ได้รายการว่าง', async () => {
    for (const status of [400, 404]) {
      stubFetch(() => new Response('{"status":"error"}', { status }));
      await expect(
        new HttpPlaybackClient(config).list('cam/c1', new Date(), new Date()),
      ).resolves.toEqual([]);
    }
  });

  it('MediaMTX ล่มหรือ secret ไม่ตรง ได้ 503 RECORDING_UNAVAILABLE', async () => {
    stubFetch(() => new Response('', { status: 401 }));
    expect(
      await rejection(new HttpPlaybackClient(config).list('cam/c1', new Date(), new Date())),
    ).toBe('RECORDING_UNAVAILABLE');
    stubFetch(() => Promise.reject(new TypeError('fetch failed')));
    expect(
      await rejection(new HttpPlaybackClient(config).list('cam/c1', new Date(), new Date())),
    ).toBe('RECORDING_UNAVAILABLE');
  });
});

describe('HttpPlaybackClient.clip', () => {
  it('ขอช่วงเวลาตามที่กำหนดและรูปแบบไฟล์', async () => {
    const calls = stubFetch(() => new Response('mp4data', { status: 200 }));
    const res = await new HttpPlaybackClient(config).clip(
      'cam/c1',
      new Date('2026-10-24T10:12:00Z'),
      30,
      'mp4',
    );
    expect(await res.text()).toBe('mp4data');
    const url = new URL(calls[0].url);
    expect(url.pathname).toBe('/get');
    expect(url.searchParams.get('duration')).toBe('30');
    expect(url.searchParams.get('format')).toBe('mp4');
  });

  it('ไม่มีไฟล์ช่วงนั้นได้ 404 NO_RECORDING', async () => {
    stubFetch(() => new Response('', { status: 404 }));
    expect(
      await rejection(new HttpPlaybackClient(config).clip('cam/c1', new Date(), 30, 'fmp4')),
    ).toBe('NO_RECORDING');
  });
});
