import type { CameraIdentity, LiveSession } from '../camera/camera.repo.js';
import type { AppConfig } from '../config/config.js';
import { signMediaToken, type MediaTokenPayload } from './media-token.js';
import { MediaService, type MediaAuthRequest } from './media.service.js';

const NOW = new Date('2026-10-24T02:00:00Z');
const TOKEN_SECRET = 't'.repeat(32);
const SERVER_SECRET = 'p'.repeat(32);

const camA: CameraIdentity = {
  id: '11111111-1111-1111-1111-111111111111',
  roomId: 'r1',
  kind: 'front',
};
const camB: CameraIdentity = {
  id: '22222222-2222-2222-2222-222222222222',
  roomId: 'r2',
  kind: 'front',
};
const door: CameraIdentity = {
  id: '33333333-3333-3333-3333-333333333333',
  roomId: 'r1',
  kind: 'door',
};
const byId: Record<string, CameraIdentity> = { [camA.id]: camA, [camB.id]: camB, [door.id]: door };

const session: LiveSession = {
  id: 's1',
  courseCode: 'CS101',
  courseName: 'ทดสอบ',
  startsAt: new Date('2026-10-24T02:00:00Z'),
  endsAt: new Date('2026-10-24T05:00:00Z'),
};

function setup(opts: { live?: boolean; secrets?: boolean } = {}) {
  const config = {
    mediaTokenSecret: opts.secrets === false ? null : TOKEN_SECRET,
    mediaServerSecret: opts.secrets === false ? null : SERVER_SECRET,
  } as AppConfig;
  const service = new MediaService(
    {
      findById: async (id: string) => byId[id] ?? null,
    },
    { liveSessionFor: async () => (opts.live === false ? null : session) },
    config,
    () => NOW,
  );
  return service;
}

const publish = (path: string, token: string): MediaAuthRequest => ({
  action: 'publish',
  protocol: 'rtsp',
  path,
  query: `token=${token}`,
});

const viewer = (extra: Partial<MediaTokenPayload> = {}) =>
  signMediaToken(TOKEN_SECRET, {
    sub: 'u1',
    path: `cam/${camA.id}`,
    act: 'read',
    sid: 's1',
    exp: NOW.getTime() + 60_000,
    ...extra,
  });

const read = (token: string, path = `cam/${camA.id}`): MediaAuthRequest => ({
  action: 'read',
  protocol: 'webrtc',
  path,
  token,
});

const publishToken = (extra: Partial<MediaTokenPayload> = {}) =>
  signMediaToken(TOKEN_SECRET, {
    sub: camA.id,
    path: `cam/${camA.id}`,
    act: 'publish',
    sid: 's1',
    exp: NOW.getTime() + 600_000,
    ...extra,
  });

describe('MediaService.authorize กล้องส่งวิดีโอ', () => {
  it('token ส่งวิดีโอที่ API ออกให้ path ตรง และห้องยังมีคาบ ผ่าน', async () => {
    await expect(setup().authorize(publish(`cam/${camA.id}`, publishToken()))).resolves.toBe(true);
  });

  it('token ของกล้องห้อง A ส่งเข้า path ของกล้อง B ไม่ผ่าน', async () => {
    await expect(setup().authorize(publish(`cam/${camB.id}`, publishToken()))).resolves.toBe(false);
  });

  it('ไม่มีคาบแล้ว ไม่ผ่าน จึงไม่มีการอัดนอกคาบ', async () => {
    await expect(
      setup({ live: false }).authorize(publish(`cam/${camA.id}`, publishToken())),
    ).resolves.toBe(false);
  });

  it('token กล้องตัวจริงใช้ส่งวิดีโอไม่ได้แล้ว (ไม่ให้ไปอยู่ใน argv ของ ffmpeg)', async () => {
    await expect(setup().authorize(publish(`cam/${camA.id}`, 'tokA'))).resolves.toBe(false);
  });

  it('token หมดอายุ เป็น token ดูสด กล้องถูกลบ หรือกล้องประตู ไม่ผ่าน', async () => {
    const service = setup();
    const path = `cam/${camA.id}`;
    await expect(
      service.authorize(publish(path, publishToken({ exp: NOW.getTime() }))),
    ).resolves.toBe(false);
    await expect(service.authorize(publish(path, publishToken({ act: 'read' })))).resolves.toBe(
      false,
    );
    const gone = '44444444-4444-4444-4444-444444444444';
    await expect(
      service.authorize(publish(`cam/${gone}`, publishToken({ sub: gone, path: `cam/${gone}` }))),
    ).resolves.toBe(false);
    await expect(
      service.authorize(
        publish(`cam/${door.id}`, publishToken({ sub: door.id, path: `cam/${door.id}` })),
      ),
    ).resolves.toBe(false);
  });

  it('ส่งผ่านช่องทางอื่นที่ไม่ใช่ RTSP หรือยังไม่ได้ตั้ง secret ไม่ผ่าน', async () => {
    const req = publish(`cam/${camA.id}`, publishToken());
    await expect(setup().authorize({ ...req, protocol: 'webrtc' })).resolves.toBe(false);
    await expect(setup({ secrets: false }).authorize(req)).resolves.toBe(false);
  });
});

describe('MediaService.authorize คนดูสด', () => {
  it('token ที่ API ออกให้ path ตรง ยังไม่หมดอายุ ผ่าน', async () => {
    await expect(setup().authorize(read(viewer()))).resolves.toBe(true);
  });

  it('ส่ง token มาในช่อง password ก็ผ่าน', async () => {
    await expect(
      setup().authorize({
        action: 'read',
        protocol: 'webrtc',
        path: `cam/${camA.id}`,
        password: viewer(),
      }),
    ).resolves.toBe(true);
  });

  it('path ไม่ตรง หมดอายุ หรือเป็น token คลิป ไม่ผ่าน', async () => {
    const service = setup();
    await expect(service.authorize(read(viewer(), `cam/${camB.id}`))).resolves.toBe(false);
    await expect(service.authorize(read(viewer({ exp: NOW.getTime() })))).resolves.toBe(false);
    await expect(service.authorize(read(viewer({ act: 'clip' })))).resolves.toBe(false);
  });

  it('token ของคาบอื่น (ห้องนี้เปลี่ยนคาบแล้ว) หรือห้องไม่มีคาบแล้ว ไม่ผ่าน', async () => {
    await expect(setup().authorize(read(viewer({ sid: 's0' })))).resolves.toBe(false);
    await expect(setup({ live: false }).authorize(read(viewer()))).resolves.toBe(false);
  });

  it('อ่านผ่าน RTSP ไม่ผ่าน (ดูได้ทางเว็บเท่านั้น)', async () => {
    await expect(setup().authorize({ ...read(viewer()), protocol: 'rtsp' })).resolves.toBe(false);
  });

  it('ยังไม่ได้ตั้ง MEDIA_TOKEN_SECRET ไม่ผ่านทุกกรณี', async () => {
    await expect(setup({ secrets: false }).authorize(read(viewer()))).resolves.toBe(false);
  });
});

describe('MediaService.authorize อื่น ๆ', () => {
  it('playback ด้วย secret ของ API ผ่าน ค่าอื่นไม่ผ่าน', async () => {
    const service = setup();
    await expect(service.authorize({ action: 'playback', token: SERVER_SECRET })).resolves.toBe(
      true,
    );
    await expect(service.authorize({ action: 'playback', token: 'x'.repeat(32) })).resolves.toBe(
      false,
    );
    await expect(service.authorize({ action: 'playback', token: viewer() })).resolves.toBe(false);
    await expect(
      setup({ secrets: false }).authorize({ action: 'playback', token: SERVER_SECRET }),
    ).resolves.toBe(false);
  });

  it('control API ด้วย secret ของ API ผ่าน (ใช้ตัดสายตอนหมดคาบ) ค่าอื่นไม่ผ่าน', async () => {
    const service = setup();
    await expect(service.authorize({ action: 'api', token: SERVER_SECRET })).resolves.toBe(true);
    await expect(service.authorize({ action: 'api', token: viewer() })).resolves.toBe(false);
    await expect(service.authorize({ action: 'api' })).resolves.toBe(false);
  });

  it('metrics / pprof ไม่ผ่านเสมอ', async () => {
    const service = setup();
    for (const action of ['metrics', 'pprof']) {
      await expect(service.authorize({ action, token: SERVER_SECRET })).resolves.toBe(false);
    }
  });
});
