import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { EnrollmentController } from './../src/enrollment/enrollment.controller.js';
import { EnrollmentService, type UploadedImage } from './../src/enrollment/enrollment.service.js';
import { EnvelopeInterceptor } from './../src/common/envelope.interceptor.js';
import { HttpExceptionFilter } from './../src/common/http-exception.filter.js';

// ทดสอบทางอัปโหลดจริงผ่าน multer โดยไม่ต้อง login (service ปลอม ไม่มี guard)
describe('PUT /me/face/:pose (อัปโหลด)', () => {
  let app: INestApplication<App>;
  let received: UploadedImage | undefined;
  let identity: { card?: UploadedImage; face?: UploadedImage } | undefined;

  beforeEach(async () => {
    received = undefined;
    identity = undefined;
    const moduleRef = await Test.createTestingModule({
      controllers: [EnrollmentController],
      providers: [
        {
          provide: EnrollmentService,
          useValue: {
            savePose: async (_user: unknown, _pose: string, file: UploadedImage | undefined) => {
              received = file;
              return { done: ['front'], complete: false };
            },
            verifyIdentity: async (
              _user: unknown,
              card: UploadedImage | undefined,
              face: UploadedImage | undefined,
            ) => {
              identity = { card, face };
              return { done: ['front'], complete: false, verified: true };
            },
          },
        },
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

  it('ส่งรูปถึง service พร้อม mime', async () => {
    await request(app.getHttpServer())
      .put('/me/face/front')
      .attach('image', Buffer.alloc(1000, 1), { filename: 'face.jpg', contentType: 'image/jpeg' })
      .expect(200)
      .expect({ data: { done: ['front'], complete: false } });
    expect(received?.mimetype).toBe('image/jpeg');
    expect(received?.size).toBe(1000);
  });

  it('รูปเกิน 5 MB ได้ 413 IMAGE_TOO_LARGE', async () => {
    await request(app.getHttpServer())
      .put('/me/face/front')
      .attach('image', Buffer.alloc(6 * 1024 * 1024, 1), {
        filename: 'face.jpg',
        contentType: 'image/jpeg',
      })
      .expect(413)
      .expect({ error: { code: 'IMAGE_TOO_LARGE', message: 'รูปใหญ่เกิน 5 MB' } });
    expect(received).toBeUndefined();
  });

  it('ส่งไฟล์ผิดช่องได้ 400 ข้อความไทย', async () => {
    await request(app.getHttpServer())
      .put('/me/face/front')
      .attach('photo', Buffer.alloc(10, 1), { filename: 'x.jpg', contentType: 'image/jpeg' })
      .expect(400)
      .expect({ error: { code: 'BAD_REQUEST', message: 'ส่งรูปมาไม่ถูกต้อง' } });
  });

  it('POST /me/identity ส่งทั้งบัตรและรูปหน้าถึง service', async () => {
    await request(app.getHttpServer())
      .post('/me/identity')
      .attach('card', Buffer.alloc(2000, 1), { filename: 'card.png', contentType: 'image/png' })
      .attach('face', Buffer.alloc(1000, 1), { filename: 'face.jpg', contentType: 'image/jpeg' })
      .expect(200)
      .expect({ data: { done: ['front'], complete: false, verified: true } });
    expect(identity?.card?.mimetype).toBe('image/png');
    expect(identity?.card?.size).toBe(2000);
    expect(identity?.face?.mimetype).toBe('image/jpeg');
  });

  it('POST /me/identity ไม่แนบไฟล์ service ได้ undefined ทั้งคู่', async () => {
    await request(app.getHttpServer()).post('/me/identity').expect(200);
    expect(identity).toEqual({ card: undefined, face: undefined });
  });

  it('POST /me/identity บัตรเกิน 5 MB ได้ 413', async () => {
    await request(app.getHttpServer())
      .post('/me/identity')
      .attach('card', Buffer.alloc(6 * 1024 * 1024, 1), {
        filename: 'card.png',
        contentType: 'image/png',
      })
      .expect(413);
    expect(identity).toBeUndefined();
  });

  it('POST /me/identity ส่งไฟล์ผิดช่องได้ 400', async () => {
    await request(app.getHttpServer())
      .post('/me/identity')
      .attach('photo', Buffer.alloc(10, 1), { filename: 'x.jpg', contentType: 'image/jpeg' })
      .expect(400);
  });
});
