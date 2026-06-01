import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import * as express from 'express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { Configuration } from './config/configuration';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  const configService = app.get(ConfigService<Configuration>);
  const jsonLimit = configService.get<number>('limits.json') ?? 10 * 1024 * 1024;
  const urlencodedLimit =
    configService.get<number>('limits.urlencoded') ?? 10 * 1024 * 1024;
  const allowedOrigins =
    configService.get<string>('ALLOWED_ORIGINS')?.split(',').filter(Boolean) ?? [];

  app.use(express.json({ limit: jsonLimit }));
  app.use(express.urlencoded({ limit: urlencodedLimit, extended: true }));
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

  const nodeEnv = process.env.NODE_ENV || 'development';
  const swaggerEnabled = process.env.SWAGGER_ENABLED === 'true';
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

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
