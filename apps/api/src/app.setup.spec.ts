import type { INestApplication } from '@nestjs/common';
import express from 'express';
import request from 'supertest';
import { configureApp } from './app.setup.js';

describe('Express trust proxy', () => {
  it.each([
    [[], '127.0.0.1'],
    [['192.0.2.10'], '127.0.0.1'],
    [['127.0.0.1'], '198.51.100.20'],
  ] as const)('uses only configured proxy addresses (%j)', async (trustedProxies, expectedIp) => {
    const server = express();
    configureApp({
      get: () => ({ allowedOrigins: [], trustedProxies }),
      getHttpAdapter: () => ({ getInstance: () => server }),
      use: server.use.bind(server),
      enableCors: () => undefined,
      useGlobalInterceptors: () => undefined,
      useGlobalFilters: () => undefined,
    } as unknown as INestApplication);

    server.get('/ip', (req, res) => res.send(req.ip?.replace(/^::ffff:/, '')));
    await request(server).get('/ip')
      .set('X-Forwarded-For', '203.0.113.99, 198.51.100.20')
      .expect(200, expectedIp);
  });
});
