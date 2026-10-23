import { existsSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { FrameWorker } from './attendance/frame.worker.js';
import { UnknownCleanupRunner } from './attendance/unknown-cleanup.runner.js';
import { configureApp } from './app.setup.js';
import { OrphanFilesRunner } from './cleanup/orphan-files.runner.js';
import { SessionSyncRunner } from './sessions/session-sync.runner.js';

if (existsSync('.env')) process.loadEnvFile('.env');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = configureApp(app);
  await app.listen(config.port);
  app.get(SessionSyncRunner).start();
  app.get(FrameWorker).start();
  app.get(UnknownCleanupRunner).start();
  app.get(OrphanFilesRunner).start();
}
await bootstrap();
