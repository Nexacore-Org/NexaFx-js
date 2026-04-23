import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { ApiUsageInterceptor } from './common/interceptors/api-usage.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { Logger } from '@nestjs/common';
import * as express from 'express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  try {
    const app = await NestFactory.create(AppModule);
    const configService = app.get(ConfigService);

    // Apply request body size limits globally
    const jsonLimit = configService.get('limits.json');
    const urlEncodedLimit = configService.get('limits.urlencoded');
    
    app.use(express.json({ limit: jsonLimit }));
    app.use(express.urlencoded({ limit: urlEncodedLimit, extended: true }));

    // Register global API usage interceptor
    const apiUsageService = app.get('ApiUsageService');
    if (apiUsageService) {
      app.useGlobalInterceptors(new ApiUsageInterceptor(apiUsageService));
    }

    // Register global logging interceptor (structured JSON with correlation IDs)
    const loggingInterceptor = app.get(LoggingInterceptor);
    app.useGlobalInterceptors(loggingInterceptor);

    // Graceful shutdown signal handlers
    const shutdownService = app.get('ShutdownService', { strict: false });
    const queueService = app.get('QueueService', { strict: false });
    const notificationsGateway = app.get('NotificationsGateway', { strict: false });
    const shutdownTimeoutMs = parseInt(process.env.SHUTDOWN_TIMEOUT_MS || '30000', 10);

    const gracefulShutdown = async (signal: string) => {
      logger.warn(`Received ${signal} — initiating graceful shutdown`);
      if (shutdownService) shutdownService.beginShutdown();

      // Notify and disconnect WebSocket clients
      if (notificationsGateway?.gracefulDisconnect) {
        await notificationsGateway.gracefulDisconnect(shutdownTimeoutMs);
      }

      // Drain BullMQ queues
      if (queueService?.drainAllQueues) {
        await queueService.drainAllQueues(shutdownTimeoutMs);
      }

      await app.close();
      process.exit(0);
    };
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Log non-sensitive configuration
    logger.log('Application configuration loaded successfully');
    logger.log(`Environment: ${configService.get('app.nodeEnv')}`);
    logger.log(`Port: ${configService.get('app.port')}`);
    logger.log(`Database Host: ${configService.get('database.host')}`);
    logger.log(`Database Port: ${configService.get('database.port')}`);
    logger.log(`Database Name: ${configService.get('database.database')}`);
    logger.log(`Mail Host: ${configService.get('mail.host')}`);
    logger.log(`Redis Host: ${configService.get('redis.host')}`);
    logger.log(`Rate Limit Window: ${configService.get('rateLimit.windowMs')}ms`);
    logger.log(`Rate Limit Max Requests: ${configService.get('rateLimit.maxRequests')}`);

    // Mask sensitive values in logs
    logger.log(`JWT Secret: ${maskSensitive(configService.get('jwt.secret') || '')}`);
    logger.log(`Refresh Token Secret: ${maskSensitive(configService.get('refreshToken.secret') || '')}`);
    logger.log(`OTP Secret: ${maskSensitive(configService.get('otp.secret') || '')}`);
    logger.log(`DB Password: ${maskSensitive(configService.get('database.password') || '')}`);
    logger.log(`Wallet Key: ${maskSensitive(configService.get('wallet.encryptionKey') || '')}`);
    logger.log(`External API Key: ${maskSensitive(configService.get('externalApi.key') || '')}`);
    logger.log(`Mail Password: ${maskSensitive(configService.get('mail.password') || '')}`);
    logger.log(`Redis Password: ${maskSensitive(configService.get('redis.password') || '')}`);

    // Configure Swagger/OpenAPI
    const swaggerConfig = new DocumentBuilder()
      .setTitle('NexaFx API')
      .setDescription('NexaFx financial platform REST API')
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'access-token',
      )
      .addServer(`/api/v1`, 'API v1')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });

    app.setGlobalPrefix('api/v1');

    const port = configService.get('app.port');
    await app.listen(port);

    logger.log(`Application is running on: http://localhost:${port}`);
    logger.log(`Swagger UI available at: http://localhost:${port}/api/docs`);
  } catch (error) {
    logger.error('Failed to start application', error.stack);
    process.exit(1);
  }
}

/**
 * Masks sensitive values for logging
 * Shows first 4 and last 4 characters
 */
function maskSensitive(value: string): string {
  if (!value || value.length <= 8) {
    return '****';
  }
  return `${value.substring(0, 4)}${'*'.repeat(value.length - 8)}${value.substring(value.length - 4)}`;
}


bootstrap();
