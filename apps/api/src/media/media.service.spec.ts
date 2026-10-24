import type { CameraIdentity, LiveSession } from '../camera/camera.repo.js';
import { hashToken } from '../camera/camera-token.js';
import type { AppConfig } from '../config/config.js';
import { signMediaToken, type MediaTokenPayload } from './media-token.js';
import { MediaService, type MediaAuthRequest } from './media.service.js';

const NOW = new Date('2026-10-24T02:00:00Z');
const TOKEN_SECRET = 't'.repeat(32);
const PLAYBACK_SECRET = 'p'.repeat(32);

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
const tokens: Record<string, CameraIdentity> = {
  [hashToken('tokA')]: camA,
  [hashToken('tokB')]: camB,
  [hashToken('tokDoor')]: door,
};

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
    mediaPlaybackSecret: opts.secrets === false ? null : PLAYBACK_SECRET,
  } as AppConfig;
  const service = new MediaService(
    { findByTokenHash: async (hash: string) => tokens[hash] ?? null },
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

describe('MediaService.authorize กล้องส่งภาพ', () => {
  it('token กล้องถูก path ของตัวเอง และมีคาบอยู่ ผ่าน', async () => {
    await expect(setup().authorize(publish(`cam/${camA.id}`, 'tokA'))).resolves.toBe(true);
  });

  it('ใช้ token ห้อง A ส่งเข้า path ของกล้อง B ไม่ผ่าน', async () => {
    await expect(setup().authorize(publish(`cam/${camB.id}`, 'tokA'))).resolves.toBe(false);
  });

  it('ไม่มีคาบ ไม่ผ่าน จึงไม่มีการอัดนอกคาบ', async () => {
    await expect(setup({ live: false }).authorize(publish(`cam/${camA.id}`, 'tokA'))).resolves.toBe(
      false,
    );
  });

  it('token ผิด ไม่มี token หรือกล้องประตู ไม่ผ่าน', async () => {
    const service = setup();
    await expect(service.authorize(publish(`cam/${camA.id}`, 'nope'))).resolves.toBe(false);
    await expect(
      service.authorize({ action: 'publish', protocol: 'rtsp', path: `cam/${camA.id}`, query: '' }),
    ).resolves.toBe(false);
    await expect(service.authorize(publish(`cam/${door.id}`, 'tokDoor'))).resolves.toBe(false);
  });

  it('ส่งภาพผ่านช่องทางอื่นที่ไม่ใช่ RTSP ไม่ผ่าน', async () => {
    await expect(
      setup().authorize({ ...publish(`cam/${camA.id}`, 'tokA'), protocol: 'webrtc' }),
    ).resolves.toBe(false);
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
    await expect(service.authorize({ action: 'playback', token: PLAYBACK_SECRET })).resolves.toBe(
      true,
    );
    await expect(service.authorize({ action: 'playback', token: 'x'.repeat(32) })).resolves.toBe(
      false,
    );
    await expect(service.authorize({ action: 'playback', token: viewer() })).resolves.toBe(false);
    await expect(
      setup({ secrets: false }).authorize({ action: 'playback', token: PLAYBACK_SECRET }),
    ).resolves.toBe(false);
  });

  it('api / metrics / pprof ไม่ผ่านเสมอ', async () => {
    const service = setup();
    for (const action of ['api', 'metrics', 'pprof']) {
      await expect(service.authorize({ action, token: PLAYBACK_SECRET })).resolves.toBe(false);
    }
  });
});
