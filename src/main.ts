// Tracing must be initialised before any other imports so that auto-instrumentation
// can patch modules (http, typeorm, etc.) before they are first required.
import './tracing';

import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap/configure-app';
import { Configuration } from './config/configuration';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  const configService = app.get(ConfigService<Configuration>);
  const port = configService.get<number>('app.port');
  if (!port || isNaN(port)) {
    throw new Error(`Invalid PORT: ${port}`);
  }

  configureApp(app, configService);

  await app.listen(port);
}

void bootstrap();
