import type { AppConfig } from '../config/config.js';
import { FaceClient } from './face.client.js';

const config = {
  faceServiceUrl: 'http://face.test',
  faceServiceToken: 'f'.repeat(32),
} as AppConfig;

interface Call {
  url: string;
  init: RequestInit;
}

function stubFetch(respond: (call: Call) => Promise<Response> | Response) {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    const call = { url, init };
    calls.push(call);
    return respond(call);
  });
  return calls;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    const e = error as { getStatus(): number; code: string; message: string };
    return { status: e.getStatus(), code: e.code, message: e.message };
  }
  throw new Error('คาดว่าจะ throw แต่ไม่ throw');
}

const image = Buffer.from('fake-jpeg');

afterEach(() => vi.unstubAllGlobals());

describe('FaceClient', () => {
  it('แนบ X-Face-Token ทุกครั้ง', async () => {
    const calls = stubFetch(() => json(200, { data: { results: [] } }));
    await new FaceClient(config).match([], []);
    expect(new Headers(calls[0].init.headers).get('X-Face-Token')).toBe('f'.repeat(32));
    expect(calls[0].url).toBe('http://face.test/faces/match');
  });

  it('enroll ส่ง multipart field image แล้วคืน data', async () => {
    const data = {
      embedding: [0.1],
      bbox: [1, 2, 3, 4],
      detScore: 0.9,
      pose: null,
      sharpness: 100,
      model: 'buffalo_l',
    };
    const calls = stubFetch(() => json(200, { data }));
    const result = await new FaceClient(config).enroll(image, 'image/jpeg');

    expect(calls[0].url).toBe('http://face.test/faces/enroll');
    expect(calls[0].init.method).toBe('POST');
    const form = calls[0].init.body as FormData;
    const file = form.get('image') as File;
    expect(file.type).toBe('image/jpeg');
    expect(Buffer.from(await file.arrayBuffer()).toString()).toBe('fake-jpeg');
    expect(result).toEqual(data);
  });

  it('detect ส่งไปที่ /faces/detect', async () => {
    const data = { width: 10, height: 10, faces: [], skippedSmall: 0 };
    const calls = stubFetch(() => json(200, { data }));
    expect(await new FaceClient(config).detect(image, 'image/jpeg')).toEqual(data);
    expect(calls[0].url).toBe('http://face.test/faces/detect');
  });

  it('match ส่ง JSON และคืนรายการผล', async () => {
    const results = [{ bestId: 'a', score: 0.8, secondId: null, secondScore: null }];
    const calls = stubFetch(() => json(200, { data: { results } }));
    const out = await new FaceClient(config).match([[0.1]], [{ id: 'a', embeddings: [[0.1]] }]);

    expect(out).toEqual(results);
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      probes: [[0.1]],
      candidates: [{ id: 'a', embeddings: [[0.1]] }],
    });
  });

  it('422 MULTIPLE_FACES ส่งต่อ status, code และข้อความเดิม', async () => {
    stubFetch(() =>
      json(422, { error: { code: 'MULTIPLE_FACES', message: 'พบหลายใบหน้าในรูป' } }),
    );
    expect(await rejection(new FaceClient(config).enroll(image, 'image/jpeg'))).toEqual({
      status: 422,
      code: 'MULTIPLE_FACES',
      message: 'พบหลายใบหน้าในรูป',
    });
  });

  it.each([
    [422, 'BAD_EMBEDDING'],
    [413, 'REQUEST_TOO_LARGE'],
    [404, 'NOT_FOUND'],
  ])('%i %s เป็นปัญหาฝั่งระบบ ไม่ส่งต่อให้ผู้ใช้ ได้ 503', async (status, code) => {
    stubFetch(() => json(status, { error: { code, message: 'x' } }));
    expect(await rejection(new FaceClient(config).detect(image, 'image/jpeg'))).toMatchObject({
      status: 503,
      code: 'FACE_SERVICE_UNAVAILABLE',
    });
  });

  it('ต่อ face service ไม่ได้ได้ 503', async () => {
    stubFetch(() => Promise.reject(new TypeError('fetch failed')));
    expect(
      (await rejection(new FaceClient(config).enroll(image, 'image/jpeg'))).code,
    ).toBe('FACE_SERVICE_UNAVAILABLE');
  });

  it('timeout ได้ 503 และตั้ง signal ไว้ทุกครั้ง', async () => {
    const calls = stubFetch(() =>
      Promise.reject(new DOMException('timed out', 'TimeoutError')),
    );
    const result = await rejection(new FaceClient(config).detect(image, 'image/jpeg'));
    expect(result.status).toBe(503);
    expect(result.code).toBe('FACE_SERVICE_UNAVAILABLE');
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
  });

  it('500 จาก face service ได้ 503', async () => {
    stubFetch(() => json(500, { error: { code: 'INTERNAL', message: 'x' } }));
    expect(await rejection(new FaceClient(config).detect(image, 'image/jpeg'))).toMatchObject({
      status: 503,
      code: 'FACE_SERVICE_UNAVAILABLE',
    });
  });

  it('ตอบ 2xx แต่ไม่มี data ถือว่า service ผิดปกติ ได้ 503', async () => {
    stubFetch(() => json(200, { ok: true }));
    expect(await rejection(new FaceClient(config).detect(image, 'image/jpeg'))).toMatchObject({
      status: 503,
      code: 'FACE_SERVICE_UNAVAILABLE',
    });
  });

  it('401 จาก face service (token ไม่ตรง) ได้ 503 ไม่ส่ง UNAUTHORIZED ไปให้ผู้ใช้', async () => {
    stubFetch(() => json(401, { error: { code: 'UNAUTHORIZED', message: 'x' } }));
    expect(await rejection(new FaceClient(config).detect(image, 'image/jpeg'))).toMatchObject({
      status: 503,
      code: 'FACE_SERVICE_UNAVAILABLE',
    });
  });
});
