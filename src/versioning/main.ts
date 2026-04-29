import { NestFactory } from '@nestjs/core';
import { VersioningType, ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from '../app.module';
import {
  SUPPORTED_VERSIONS,
  CURRENT_API_VERSION,
  API_VERSIONS,
} from './api-version.constants';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ─── URI-Based API Versioning ─────────────────────────────────────────────
  app.enableVersioning({
    type: VersioningType.URI,
    prefix: 'v',
    defaultVersion: CURRENT_API_VERSION,
  });

  // ─── Global Validation ────────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // ─── Swagger Documentation ────────────────────────────────────────────────
  const config = new DocumentBuilder()
    .setTitle('NexaFx API')
    .setDescription(
      `
## API Versioning Strategy

NexaFx uses **URI-based versioning** (e.g., \`/v1/\`, \`/v2/\`).

### Supported Versions
${SUPPORTED_VERSIONS.map((v) => `- \`/v${v}/\` ${v === CURRENT_API_VERSION ? '✅ **Current**' : '⚠️ Deprecated'}`).join('\n')}

### Deprecation Policy
- Deprecated versions include \`X-API-Deprecated: true\` response headers
- Sunset dates are communicated via the \`Sunset\` header
- Breaking changes only occur in new major versions

### Migration Guide
See individual endpoint documentation for migration notes.
    `.trim(),
    )
    .setVersion(CURRENT_API_VERSION)
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  // ─── CORS ─────────────────────────────────────────────────────────────────
  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') ?? '*',
    exposedHeaders: [
      'X-API-Version',
      'X-API-Deprecated',
      'X-API-Deprecation-Date',
      'Sunset',
      'Link',
    ],
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`🚀 NexaFx API running at http://localhost:${port}/v${CURRENT_API_VERSION}/`);
  console.log(`📚 Swagger docs at http://localhost:${port}/api/docs`);
}

bootstrap();
