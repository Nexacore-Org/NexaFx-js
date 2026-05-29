import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import * as express from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  const jsonLimit = configService.get<number>('limits.json');
  const urlencodedLimit = configService.get<number>('limits.urlencoded');

  app.use(express.json({ limit: jsonLimit }));
  app.use(express.urlencoded({ limit: urlencodedLimit, extended: true }));

  app.setGlobalPrefix('api/v1');

  // Configure Swagger/OpenAPI
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

  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();
