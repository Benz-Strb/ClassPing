import type { INestApplication } from '@nestjs/common';
import { EnvelopeInterceptor } from './common/envelope.interceptor.js';
import { HttpExceptionFilter } from './common/http-exception.filter.js';
import { APP_CONFIG, type AppConfig } from './config/config.js';

// ใช้ทั้งตอนรันจริงและใน e2e test ให้พฤติกรรมเหมือนกัน
export function configureApp(app: INestApplication): AppConfig {
  const config = app.get<AppConfig>(APP_CONFIG);
  app.enableCors({ origin: config.allowedOrigins });
  app.useGlobalInterceptors(new EnvelopeInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());
  return config;
}
