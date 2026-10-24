import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { FRAME_QUEUE, type FrameJob } from './../src/attendance/frame-queue.js';
import { CameraController } from './../src/camera/camera.controller.js';
import { CameraGuard } from './../src/camera/camera.guard.js';
import { CAMERA_REPO, type CameraRepo } from './../src/camera/camera.repo.js';
import { CameraService } from './../src/camera/camera.service.js';
import { hashToken } from './../src/camera/camera-token.js';
import { CLOCK } from './../src/common/clock.js';
import { EnvelopeInterceptor } from './../src/common/envelope.interceptor.js';
import { HttpExceptionFilter } from './../src/common/http-exception.filter.js';
import { APP_CONFIG } from './../src/config/config.js';

// guard + multer จริง ส่วนฐานข้อมูลและคิวเป็นของปลอม
describe('กล้องหน้าห้อง (e2e)', () => {
  let app: INestApplication<App>;
  let added: FrameJob[];

  const jpeg = Buffer.alloc(500, 1);
  jpeg.set([0xff, 0xd8, 0xff]);

  beforeEach(async () => {
    added = [];
    const repo: CameraRepo = {
      findByTokenHash: async (hash) =>
        hash === hashToken('good') ? { id: 'cam1', roomId: 'r1', kind: 'front' } : null,
      findById: async () => null,
      touch: async () => undefined,
      liveSession: async () => ({
        id: 's1',
        courseCode: 'CS101',
        courseName: 'ทดสอบ',
        startsAt: new Date('2026-10-22T02:00:00Z'),
        endsAt: new Date('2026-10-22T05:00:00Z'),
      }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [CameraController],
      providers: [
        CameraService,
        CameraGuard,
        { provide: CAMERA_REPO, useValue: repo },
        {
          provide: FRAME_QUEUE,
          useValue: { add: async (job: FrameJob) => void added.push(job), waiting: async () => 0 },
        },
        { provide: APP_CONFIG, useValue: { cameraOpenBeforeMin: 0 } },
        { provide: CLOCK, useValue: () => new Date('2026-10-22T02:05:00Z') },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalInterceptors(new EnvelopeInterceptor());
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('ไม่มี token ได้ 401 และไม่รับภาพ', async () => {
    await request(app.getHttpServer())
      .post('/camera/frames')
      .attach('image', jpeg, { filename: 'f.jpg', contentType: 'image/jpeg' })
      .expect(401)
      .expect({ error: { code: 'BAD_CAMERA_TOKEN', message: 'token กล้องไม่ถูกต้อง' } });
    expect(added).toEqual([]);
  });

  it('GET /camera/session ได้คาบของห้อง', async () => {
    const res = await request(app.getHttpServer())
      .get('/camera/session')
      .set('X-Camera-Token', 'good')
      .expect(200);
    expect(res.body.data.session.id).toBe('s1');
    expect(res.body.data.fps).toBe(1);
  });

  it('ไฟล์ที่ไม่ใช่รูปได้ 400', async () => {
    await request(app.getHttpServer())
      .post('/camera/frames')
      .set('X-Camera-Token', 'good')
      .attach('image', Buffer.from('not an image'), {
        filename: 'f.jpg',
        contentType: 'image/jpeg',
      })
      .expect(400);
    expect(added).toEqual([]);
  });

  it('ภาพปกติได้ 202 และเข้าคิว', async () => {
    await request(app.getHttpServer())
      .post('/camera/frames')
      .set('X-Camera-Token', 'good')
      .attach('image', jpeg, { filename: 'f.jpg', contentType: 'image/jpeg' })
      .expect(202)
      .expect({ data: { queued: true } });
    expect(added).toHaveLength(1);
    expect(added[0].receivedAt).toBe('2026-10-22T02:05:00.000Z');
  });
});
