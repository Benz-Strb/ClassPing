import type { INestApplication } from '@nestjs/common';
import { json, type RequestHandler } from 'express';
import { EnvelopeInterceptor } from './common/envelope.interceptor.js';
import { HttpExceptionFilter } from './common/http-exception.filter.js';
import { APP_CONFIG, type AppConfig } from './config/config.js';

// ใช้ทั้งตอนรันจริงและใน e2e test ให้พฤติกรรมเหมือนกัน
export function configureApp(app: INestApplication): AppConfig {
  const config = app.get<AppConfig>(APP_CONFIG);
  // Bounded UTF-8 CSV/text payloads can exceed Express's default 100 KB.
  const catalogJson = json({ limit: '1mb' });
  // Keep Nest's global JSON parser enabled for routes outside the catalog.
  const parseCatalogJson: RequestHandler = (req, res, next) => catalogJson(req, res, next);
  app.use('/admin/catalog', parseCatalogJson);
  app.enableCors({ origin: config.allowedOrigins });
  app.useGlobalInterceptors(new EnvelopeInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());
  return config;
}
