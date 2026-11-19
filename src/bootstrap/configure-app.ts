import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import * as express from 'express';
import * as compression from 'compression';
import { GlobalExceptionFilter } from '../common/filters/global-exception.filter';
import { Configuration } from '../config/configuration';

export const GLOBAL_PREFIX = 'api/v1';

/** TRUST_PROXY=false (default) | <hops> | <comma-separated CIDRs/names>. */
export function parseTrustProxy(value: string | undefined): boolean | number | string {
  const trustProxy = value ?? 'false';
  return trustProxy === 'false' ? false : /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy;
}

export function configureApp(
  app: INestApplication,
  configService: ConfigService<Configuration>,
): void {
  // Behind a proxy or load balancer, trust an explicit hop count or CIDR list so req.ip is the
  // client (issue #1407).
  app
    .getHttpAdapter()
    .getInstance()
    .set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY));

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

  // Every controller relies on this single global prefix; no @Controller() may
  // repeat it (enforced by `npm run check:controller-prefixes`).
  app.setGlobalPrefix(GLOBAL_PREFIX);
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
      // Documented paths are relative to the global prefix.
      .addServer(`/${GLOBAL_PREFIX}`)
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }
}
