import { existsSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';

if (existsSync('.env')) process.loadEnvFile('.env');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = configureApp(app);
  await app.listen(config.port);
}
await bootstrap();
