import { Test } from '@nestjs/testing';
import {
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
  type INestApplication,
} from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { IS_PUBLIC_KEY } from './../src/auth/auth.decorators.js';
import { CAMERA_REPO } from './../src/camera/camera.repo.js';
import { CameraService } from './../src/camera/camera.service.js';
import { CLOCK } from './../src/common/clock.js';
import { EnvelopeInterceptor } from './../src/common/envelope.interceptor.js';
import { HttpExceptionFilter } from './../src/common/http-exception.filter.js';
import { APP_CONFIG } from './../src/config/config.js';
import { MediaController } from './../src/media/media.controller.js';
import { signMediaToken } from './../src/media/media-token.js';
import { MediaService } from './../src/media/media.service.js';

const CAMERA = '11111111-1111-1111-1111-111111111111';
const SECRET = 't'.repeat(32);
const NOW = new Date('2026-10-24T02:00:00Z');
const token = signMediaToken(SECRET, {
  sub: CAMERA,
  path: `cam/${CAMERA}`,
  act: 'publish',
  sid: 's1',
  exp: NOW.getTime() + 600_000,
});

// ไม่มีใคร login ได้ route ที่ไม่ได้ติด @Public() จะได้ 403
@Injectable()
class NoLogin implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext) {
    return this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
  }
}

describe('POST /media/auth (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [MediaController],
      providers: [
        MediaService,
        {
          provide: CAMERA_REPO,
          useValue: {
            findById: async (id: string) =>
              id === CAMERA ? { id: CAMERA, roomId: 'r1', kind: 'front' } : null,
          },
        },
        { provide: CameraService, useValue: { liveSessionFor: async () => ({ id: 's1' }) } },
        { provide: APP_CONFIG, useValue: { mediaTokenSecret: SECRET, mediaServerSecret: null } },
        { provide: CLOCK, useValue: () => NOW },
        { provide: APP_GUARD, useClass: NoLogin },
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

  it('กล้องที่ token ส่งวิดีโอถูก ส่งเข้า path ตัวเองได้ 204 โดยไม่ต้อง login', async () => {
    await request(app.getHttpServer())
      .post('/media/auth')
      .send({ action: 'publish', protocol: 'rtsp', path: `cam/${CAMERA}`, query: `token=${token}` })
      .expect(204);
  });

  it('token ผิดหรือ body ว่างได้ 401', async () => {
    await request(app.getHttpServer())
      .post('/media/auth')
      .send({ action: 'publish', protocol: 'rtsp', path: `cam/${CAMERA}`, query: 'token=bad' })
      .expect(401);
    await request(app.getHttpServer()).post('/media/auth').expect(401);
  });
});
