import type { INestApplication } from '@nestjs/common';
import { json, type RequestHandler } from 'express';
import { AppError } from './common/app-error.js';
import { EnvelopeInterceptor } from './common/envelope.interceptor.js';
import { HttpExceptionFilter } from './common/http-exception.filter.js';
import { APP_CONFIG, type AppConfig } from './config/config.js';

// ใช้ทั้งตอนรันจริงและใน e2e test ให้พฤติกรรมเหมือนกัน
export function configureApp(app: INestApplication): AppConfig {
  const config = app.get<AppConfig>(APP_CONFIG);
  if (config.trustedProxies?.length) {
    app.getHttpAdapter().getInstance().set('trust proxy', config.trustedProxies);
  }
  // Bounded UTF-8 CSV/text payloads can exceed Express's default 100 KB.
  const catalogJson = json({ limit: '1mb' });
  // Keep Nest's global JSON parser enabled for routes outside the catalog.
  const parseCatalogJson: RequestHandler = (req, res, next) => catalogJson(req, res, next);
  app.use(['/admin/catalog', '/teacher/curricula'], parseCatalogJson);
  // ผลหน้าจากบอร์ด (embedding + รูปครอป สูงสุด 50 หน้า) ใหญ่กว่า 100 KB
  const facesJson = json({ limit: '2mb' });
  const parseFacesJson: RequestHandler = (req, res, next) =>
    facesJson(req, res, (error?: unknown) => {
      if ((error as { type?: string } | undefined)?.type === 'entity.too.large') {
        next(new AppError(413, 'BODY_TOO_LARGE', 'ข้อมูลที่ส่งมาใหญ่เกินไป'));
        return;
      }
      next(error);
    });
  app.use('/camera/faces', parseFacesJson);
  app.enableCors({ origin: config.allowedOrigins });
  app.useGlobalInterceptors(new EnvelopeInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());
  return config;
}
