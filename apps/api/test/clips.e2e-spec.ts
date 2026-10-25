import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { HttpExceptionFilter } from './../src/common/http-exception.filter.js';
import { PLAYBACK_CLIENT } from './../src/media/playback.client.js';
import { ClipsController } from './../src/media/recording.controller.js';
import { RecordingService } from './../src/media/recording.service.js';

const START = new Date('2026-10-24T10:20:00Z');

const box = (type: string, ...parts: Buffer[]) => {
  const body = Buffer.concat(parts);
  const head = Buffer.alloc(8);
  head.writeUInt32BE(8 + body.length);
  head.write(type, 4, 'latin1');
  return Buffer.concat([head, body]);
};

// fMP4 แบบที่ MediaMTX ส่ง: init แล้วท่อนที่ tfdt เริ่มนับจาก 1 ทุกครั้ง
const mdhd = Buffer.alloc(20);
mdhd.writeUInt32BE(90000, 12);
const INIT = Buffer.concat([
  box('ftyp', Buffer.from('iso5')),
  box('moov', box('trak', box('mdia', box('mdhd', mdhd)))),
]);
const tfdt = Buffer.alloc(12);
tfdt[0] = 1;
tfdt.writeBigUInt64BE(1n, 4);
const FRAGMENT = Buffer.concat([
  box('moof', box('traf', box('tfdt', tfdt))),
  box('mdat', Buffer.from('xx')),
]);

describe('GET /clips/:token (e2e)', () => {
  let app: INestApplication<App>;
  let requested: { start: string; duration: number; format: string }[];

  beforeEach(async () => {
    requested = [];
    const moduleRef = await Test.createTestingModule({
      controllers: [ClipsController],
      providers: [
        {
          provide: RecordingService,
          useValue: {
            openClip: (token: string) => ({
              path: 'cam/c1',
              start: START,
              duration: 14,
              download: token === 'dl',
              filename: 'classping-20261024-1720.mp4',
            }),
          },
        },
        {
          provide: PLAYBACK_CLIENT,
          useValue: {
            clip: async (_path: string, start: Date, duration: number, format: string) => {
              requested.push({ start: start.toISOString(), duration, format });
              return new Response(
                format === 'mp4' ? 'mp4data' : new Uint8Array(Buffer.concat([INIT, FRAGMENT])),
              );
            },
          },
        },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const binary = (res: request.Response, cb: (err: Error | null, body: Buffer) => void) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  };

  it('playlist แบ่งท่อนละ 6 วินาที ยังไม่ดึงอะไรจาก MediaMTX', async () => {
    const res = await request(app.getHttpServer()).get('/clips/play/index.m3u8').expect(200);
    expect(res.headers['content-type']).toContain('application/vnd.apple.mpegurl');
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.text).toContain('#EXT-X-MAP:URI="init.mp4"');
    expect(res.text.match(/^seg\/\d+$/gm)).toEqual(['seg/0', 'seg/1', 'seg/2']);
    expect(requested).toEqual([]);
  });

  it('init ส่งเฉพาะ ftyp+moov', async () => {
    const res = await request(app.getHttpServer())
      .get('/clips/play/init.mp4')
      .buffer()
      .parse(binary)
      .expect(200);
    expect(res.body).toEqual(INIT);
  });

  it('ท่อนที่ขอ ดึงเฉพาะช่วงนั้น ตัด init ออก และเลื่อนเวลาให้ต่อจากท่อนก่อน', async () => {
    const res = await request(app.getHttpServer())
      .get('/clips/play/seg/2')
      .buffer()
      .parse(binary)
      .expect(200);
    expect(requested).toEqual([{ start: '2026-10-24T10:20:12.000Z', duration: 2, format: 'fmp4' }]);
    const body = res.body as Buffer;
    expect(body.subarray(4, 8).toString()).toBe('moof');
    expect(body.readBigUInt64BE(body.indexOf('tfdt') + 8)).toBe(12n * 90000n + 1n);
  });

  it('ท่อนที่ไม่มีหรือเลขผิดได้ 404', async () => {
    await request(app.getHttpServer()).get('/clips/play/seg/3').expect(404);
    await request(app.getHttpServer()).get('/clips/play/seg/1x').expect(404);
    expect(requested).toEqual([]);
  });

  it('ดาวน์โหลดส่งต่อ mp4 ทั้งคลิปเป็นไฟล์แนบ', async () => {
    const res = await request(app.getHttpServer()).get('/clips/dl').expect(200);
    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="classping-20261024-1720.mp4"',
    );
    expect(requested).toEqual([{ start: START.toISOString(), duration: 14, format: 'mp4' }]);
  });

  it('ลิงก์ดูย้อนหลังเอาไปโหลดทั้งคลิปไม่ได้', async () => {
    const res = await request(app.getHttpServer()).get('/clips/play').expect(403);
    expect(res.body.error.code).toBe('DOWNLOAD_NOT_ALLOWED');
    expect(requested).toEqual([]);
  });
});
