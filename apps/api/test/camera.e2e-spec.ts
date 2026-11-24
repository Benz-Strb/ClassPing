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
import { DoorEntries } from './../src/door/door-entries.js';
import { DoorProcessor } from './../src/door/door.processor.js';
import { CLOCK } from './../src/common/clock.js';
import { configureApp } from './../src/app.setup.js';
import { APP_CONFIG } from './../src/config/config.js';

// guard + multer จริง ส่วนฐานข้อมูลและคิวเป็นของปลอม
describe('กล้องหน้าห้อง (e2e)', () => {
  let app: INestApplication<App>;
  let added: FrameJob[];
  let outs: Buffer[][];
  let touched: string[];

  const jpeg = Buffer.alloc(500, 1);
  jpeg.set([0xff, 0xd8, 0xff]);

  beforeEach(async () => {
    added = [];
    outs = [];
    touched = [];
    const repo: CameraRepo = {
      findByTokenHash: async (hash) =>
        hash === hashToken('good')
          ? { id: 'cam1', roomId: 'r1', kind: 'front' }
          : hash === hashToken('door')
            ? { id: 'cam2', roomId: 'r1', kind: 'door' }
            : null,
      findById: async () => null,
      touch: async (id) => void touched.push(id),
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
        DoorEntries,
        {
          provide: DoorProcessor,
          useValue: {
            handleOut: async (_s: string, images: Buffer[]) => {
              outs.push(images);
              return 'confirmed';
            },
          },
        },
        { provide: CAMERA_REPO, useValue: repo },
        {
          provide: FRAME_QUEUE,
          useValue: { add: async (job: FrameJob) => void added.push(job), waiting: async () => 0 },
        },
        { provide: APP_CONFIG, useValue: { cameraOpenBeforeMin: 0, boardFaceModel: 'buffalo_l' } },
        { provide: CLOCK, useValue: () => new Date('2026-10-22T02:05:00Z') },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
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

  describe('POST /camera/faces', () => {
    const post = () => request(app.getHttpServer()).post('/camera/faces');
    const embedding = Array.from({ length: 512 }, (_, i) => (i === 0 ? 1 : 0));
    const crop = Buffer.alloc(30_000, 1);
    crop.set([0xff, 0xd8, 0xff]);
    const facesBody = (count: number) => ({
      capturedAt: '2026-10-22T02:05:00Z',
      model: 'buffalo_l',
      width: 1920,
      height: 1080,
      skippedSmall: 0,
      faces: Array.from({ length: count }, () => ({
        bbox: [10, 10, 200, 200],
        detScore: 0.9,
        embedding,
        liveness: 0.8,
        crop: crop.toString('base64'),
      })),
    });

    it('40 หน้า (ราว 1.5 MB) ได้ 202 และเข้าคิวพร้อม result', async () => {
      const payload = facesBody(40);
      expect(JSON.stringify(payload).length).toBeGreaterThan(1_400_000);
      await post()
        .set('X-Camera-Token', 'good')
        .send(payload)
        .expect(202)
        .expect({ data: { queued: true } });
      expect(added).toHaveLength(1);
      const job = added[0];
      expect('result' in job && job.result.faces).toHaveLength(40);
      expect(job.receivedAt).toBe('2026-10-22T02:05:00.000Z');
      expect(touched).toEqual(['cam1']);
    });

    it('token ผิดได้ 401', async () => {
      await post()
        .set('X-Camera-Token', 'wrong')
        .send(facesBody(1))
        .expect(401)
        .expect({ error: { code: 'BAD_CAMERA_TOKEN', message: 'token กล้องไม่ถูกต้อง' } });
      expect(added).toEqual([]);
    });

    it('body 2.5 MB ได้ 413', async () => {
      await post()
        .set('X-Camera-Token', 'good')
        .send({ ...facesBody(1), padding: 'x'.repeat(2.5 * 1024 * 1024) })
        .expect(413)
        .expect((res) => expect(res.body.error.code).toBe('BODY_TOO_LARGE'));
      expect(added).toEqual([]);
    });

    it('กล้องประตูได้ 403 และ body ผิดได้ 400', async () => {
      await post().set('X-Camera-Token', 'door').send(facesBody(1)).expect(403);
      await post()
        .set('X-Camera-Token', 'good')
        .send({ ...facesBody(1), model: 'x' })
        .expect(400)
        .expect((res) => expect(res.body.error.code).toBe('INVALID_FACES'));
      expect(added).toEqual([]);
    });
  });

  describe('POST /camera/door', () => {
    const post = () => request(app.getHttpServer()).post('/camera/door');

    it('token ผิดได้ 401', async () => {
      await post()
        .set('X-Camera-Token', 'wrong')
        .field('direction', 'out')
        .expect(401)
        .expect({ error: { code: 'BAD_CAMERA_TOKEN', message: 'token กล้องไม่ถูกต้อง' } });
      expect(outs).toEqual([]);
    });

    it('กล้องหน้าห้องได้ 403', async () => {
      await post().set('X-Camera-Token', 'good').field('direction', 'out').expect(403);
    });

    it('ออกพร้อมรูป ได้ 201 และส่งรูปให้ processor', async () => {
      await post()
        .set('X-Camera-Token', 'door')
        .field('direction', 'out')
        .attach('images', jpeg, { filename: 'a.jpg', contentType: 'image/jpeg' })
        .attach('images', jpeg, { filename: 'b.jpg', contentType: 'image/jpeg' })
        .expect(201)
        .expect({ data: { trip: 'confirmed' } });
      expect(outs).toHaveLength(1);
      expect(outs[0]).toHaveLength(2);
    });

    it('เข้าได้ 201 trip null', async () => {
      await post()
        .set('X-Camera-Token', 'door')
        .field('direction', 'in')
        .expect(201)
        .expect({ data: { trip: null } });
      expect(outs).toEqual([]);
    });

    it('ไม่มี direction ได้ 400', async () => {
      await post().set('X-Camera-Token', 'door').attach('images', jpeg, 'a.jpg').expect(400);
      await post().set('X-Camera-Token', 'door').send({}).expect(400);
    });

    it('เกิน 3 รูป หรือรูปเกิน 1 MB ได้ error และไม่เข้า processor', async () => {
      let req = post().set('X-Camera-Token', 'door').field('direction', 'out');
      for (let i = 0; i < 4; i++) req = req.attach('images', jpeg, `${i}.jpg`);
      await req.expect(400);

      const big = Buffer.alloc(1024 * 1024 + 1, 1);
      big.set([0xff, 0xd8, 0xff]);
      await post()
        .set('X-Camera-Token', 'door')
        .field('direction', 'out')
        .attach('images', big, { filename: 'big.jpg', contentType: 'image/jpeg' })
        .expect(413)
        .expect((res) => expect(res.body.error.code).toBe('IMAGE_TOO_LARGE'));
      expect(outs).toEqual([]);
    });
  });
});
