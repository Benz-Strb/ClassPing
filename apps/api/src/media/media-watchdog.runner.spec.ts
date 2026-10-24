import type { CameraIdentity } from '../camera/camera.repo.js';
import type { AppConfig } from '../config/config.js';
import type { MediaConn, MediaControl } from './media-control.client.js';
import { MediaWatchdogRunner } from './media-watchdog.runner.js';

const LIVE_CAM = '11111111-1111-1111-1111-111111111111';
const IDLE_CAM = '22222222-2222-2222-2222-222222222222';
const GONE_CAM = '33333333-3333-3333-3333-333333333333';

const cameras: Record<string, CameraIdentity> = {
  [LIVE_CAM]: { id: LIVE_CAM, roomId: 'r1', kind: 'front' },
  [IDLE_CAM]: { id: IDLE_CAM, roomId: 'r2', kind: 'front' },
};

function setup(conns: MediaConn[], opts: { secret?: boolean; failList?: boolean } = {}) {
  const kicked: string[] = [];
  const lookups: string[] = [];
  const control: MediaControl = {
    list: async () => {
      if (opts.failList) throw new Error('media down');
      return conns;
    },
    kick: async (conn) => void kicked.push(`${conn.kind}:${conn.id}`),
  };
  const runner = new MediaWatchdogRunner(
    control,
    {
      findById: async (id: string) => {
        lookups.push(id);
        return cameras[id] ?? null;
      },
    },
    {
      liveSessionFor: async (camera: CameraIdentity) =>
        camera.id === LIVE_CAM ? ({ id: 's1' } as never) : null,
    },
    { mediaServerSecret: opts.secret === false ? null : 's'.repeat(32) } as AppConfig,
    () => new Date('2026-10-24T05:00:00Z'),
  );
  return { runner, kicked, lookups };
}

const conn = (kind: 'rtsp' | 'webrtc', id: string, path: string, state = 'publish'): MediaConn => ({
  kind,
  id,
  path,
  state,
});

describe('MediaWatchdogRunner', () => {
  it('หมดคาบแล้ว ตัดทั้งกล้องที่ยังส่งภาพและคนที่ยังดูอยู่ ห้องที่มีคาบไม่แตะ', async () => {
    const { runner, kicked } = setup([
      conn('rtsp', 'p-live', `cam/${LIVE_CAM}`),
      conn('webrtc', 'v-live', `cam/${LIVE_CAM}`, 'read'),
      conn('rtsp', 'p-idle', `cam/${IDLE_CAM}`),
      conn('webrtc', 'v-idle', `cam/${IDLE_CAM}`, 'read'),
    ]);
    await runner.run();
    expect(kicked).toEqual(['rtsp:p-idle', 'webrtc:v-idle']);
  });

  it('กล้องที่ถูกลบไปแล้ว หรือ path แปลก ตัดทิ้ง', async () => {
    const { runner, kicked } = setup([
      conn('rtsp', 'p-gone', `cam/${GONE_CAM}`),
      conn('rtsp', 'p-odd', 'other/thing'),
    ]);
    await runner.run();
    expect(kicked).toEqual(['rtsp:p-gone', 'rtsp:p-odd']);
  });

  it('สายที่ยังไม่ส่งหรือดู (idle) ไม่แตะ', async () => {
    const { runner, kicked } = setup([conn('rtsp', 'p-wait', `cam/${IDLE_CAM}`, 'idle')]);
    await runner.run();
    expect(kicked).toEqual([]);
  });

  it('หลายสายบนกล้องเดียวกัน ถามฐานข้อมูลครั้งเดียว', async () => {
    const { runner, lookups } = setup([
      conn('rtsp', 'a', `cam/${LIVE_CAM}`),
      conn('webrtc', 'b', `cam/${LIVE_CAM}`, 'read'),
      conn('webrtc', 'c', `cam/${LIVE_CAM}`, 'read'),
    ]);
    await runner.run();
    expect(lookups).toEqual([LIVE_CAM]);
  });

  it('ยังไม่ตั้ง MEDIA_SERVER_SECRET ไม่ทำอะไร และ MediaMTX ล่มไม่ throw', async () => {
    const off = setup([conn('rtsp', 'p-idle', `cam/${IDLE_CAM}`)], { secret: false });
    await off.runner.run();
    expect(off.kicked).toEqual([]);
    const down = setup([], { failList: true });
    await expect(down.runner.run()).resolves.toBeUndefined();
  });
});
