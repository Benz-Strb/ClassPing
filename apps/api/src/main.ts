import { existsSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { SessionSyncRunner } from './sessions/session-sync.runner.js';

if (existsSync('.env')) process.loadEnvFile('.env');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = configureApp(app);
  await app.listen(config.port);
  app.get(SessionSyncRunner).start();
}
await bootstrap();
