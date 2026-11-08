import type { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthGuard } from '../src/auth/auth.guard.js';
import { RolesGuard } from '../src/auth/roles.guard.js';
import { ChatModule } from '../src/chat/chat.module.js';
import { ChatRepository } from '../src/chat/chat.repo.js';
import { CHAT_PROVIDER, MockChatProvider } from '../src/chat/chat.provider.js';
import { APP_CONFIG } from '../src/config/config.js';
import { SUPABASE_ADMIN } from '../src/supabase/supabase.module.js';
import { UsersService } from '../src/users/users.service.js';
import { configureApp } from '../src/app.setup.js';

describe('Chat HTTP authorization and envelopes', () => {
  let app: INestApplication;
  const repo = { search: vi.fn(), replace: vi.fn(), remove: vi.fn() };
  beforeEach(async () => {
    vi.clearAllMocks(); repo.search.mockResolvedValue([]);
    const module = await Test.createTestingModule({
      imports: [ChatModule],
      providers: [
        { provide: APP_CONFIG, useValue: { adminEmails: [] } },
        { provide: SUPABASE_ADMIN, useValue: { auth: { getUser: async (token: string) => ({ data: { user: {
          id: token, email: `${token}@dpu.ac.th`, identities: [{ provider: 'google', identity_data: {
            email: '66112126@dpu.ac.th', email_verified: true, custom_claims: { hd: 'dpu.ac.th' },
          } }],
        } }, error: null }) } } },
        { provide: UsersService, useValue: { ensureUser: async (user: { id: string }) => ({ id: user.id, role: user.id === 'admin' ? 'admin' : 'student' }) } },
        { provide: APP_GUARD, useClass: AuthGuard }, { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).overrideProvider(ChatRepository).useValue(repo)
      .overrideProvider(CHAT_PROVIDER).useValue(new MockChatProvider()).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
  });
  afterEach(async () => { await app?.close(); });
  it('public requests ignore a supplied identity and return the common data envelope', async () => {
    const res = await request(app.getHttpServer()).post('/chat/public').send({ message: 'ทุน', userId: 'someone' });
    expect(res.status).toBe(200);
    expect(res.body.data.sources).toEqual([]);
    expect(repo.search).toHaveBeenCalledWith(expect.any(Array), null, 'mock-trigram-v1');
  });
  it('private chat requires a valid session', async () => {
    const res = await request(app.getHttpServer()).post('/chat/student').send({ message: 'ทุน' });
    expect(res.status).toBe(401); expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(repo.search).not.toHaveBeenCalled();
  });
  it('student cannot ingest or delete sources', async () => {
    await request(app.getHttpServer()).post('/chat/knowledge').set('Authorization', 'Bearer student').send({}).expect(403);
    await request(app.getHttpServer()).delete('/chat/knowledge/test').set('Authorization', 'Bearer student').expect(403);
    expect(repo.replace).not.toHaveBeenCalled(); expect(repo.remove).not.toHaveBeenCalled();
  });
  it('signed-in chat uses study mode and never searches private sources', async () => {
    const res = await request(app.getHttpServer()).post('/chat/student').set('Authorization', 'Bearer student')
      .send({ message: 'ทุน', userId: 'other' }).expect(200);
    expect(res.body.data).toMatchObject({ mode: 'study', classroom: 'not_connected' });
    expect(repo.search).not.toHaveBeenCalled();
  });
  it('admin chat ignores a supplied identity and uses study mode', async () => {
    const res = await request(app.getHttpServer()).post('/chat/student').set('Authorization', 'Bearer admin')
      .send({ message: 'ข้อมูลนักศึกษา', userId: 'student', role: 'student' }).expect(200);
    expect(res.body.data.mode).toBe('study');
    expect(repo.search).not.toHaveBeenCalled();
  });

  it('invalid input uses Thai shared error envelope', async () => {
    const res = await request(app.getHttpServer()).post('/chat/public').send({ message: 123 }).expect(400);
    expect(res.body).toEqual({ error: { code: 'BAD_REQUEST', message: 'ข้อมูลที่ส่งมาไม่ถูกต้อง' } });
  });
});
