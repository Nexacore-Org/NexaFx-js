// Tracing must be initialised before any other imports so that auto-instrumentation
// can patch modules (http, typeorm, etc.) before they are first required.
import './tracing';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import * as express from 'express';
import * as compression from 'compression';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { Configuration } from './config/configuration';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  const configService = app.get(ConfigService<Configuration>);
  const port = configService.get<number>('app.port');
  if (!port || isNaN(port)) {
    throw new Error(`Invalid PORT: ${port}`);
  }
  const jsonLimit = configService.get<number>('limits.json') ?? 10 * 1024 * 1024;
  const urlencodedLimit =
    configService.get<number>('limits.urlencoded') ?? 10 * 1024 * 1024;
  const allowedOrigins =
    configService.get<string>('ALLOWED_ORIGINS')?.split(',').filter(Boolean) ?? [];

  app.use(express.json({ limit: jsonLimit }));
  app.use(express.urlencoded({ limit: urlencodedLimit, extended: true }));

  // Compress responses >1 KB; honours Accept-Encoding (gzip / deflate / br).
  // Streaming responses (no Content-Length) are skipped automatically.
  app.use(
    compression({
      threshold: 1024,
      filter: (req, res) => {
        // Skip server-sent event / chunked export streams
        if (res.getHeader('Content-Type') === 'text/event-stream') {
          return false;
        }
        return compression.filter(req, res);
      },
    }),
  );

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
    }),
  );

  app.enableCors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
    credentials: true,
  });

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.enableShutdownHooks();

  const nodeEnv = configService.get<string>('app.nodeEnv');
  const swaggerEnabled = configService.get<boolean>('app.swaggerEnabled');
  if (nodeEnv !== 'production' || swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('NexaFx API')
      .setDescription('NexaFx financial platform REST API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  const port = configService.get<number>('app.port');
  await app.listen(port);
}

void bootstrap();
