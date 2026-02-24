import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_INTERCEPTOR, APP_FILTER } from '@nestjs/core';
import { VersioningInterceptor } from './interceptors/versioning.interceptor';
import { UnsupportedVersionFilter } from './filters/unsupported-version.filter';
import { VersionNegotiationMiddleware } from './middleware/version-negotiation.middleware';
import { VersioningService } from './services/versioning.service';
import { UsersV1Controller } from './controllers/users-v1.controller';
import { UsersV2Controller } from './controllers/users-v2.controller';

@Module({
  controllers: [UsersV1Controller, UsersV2Controller],
  providers: [
    VersioningService,
    {
      provide: APP_INTERCEPTOR,
      useClass: VersioningInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: UnsupportedVersionFilter,
    },
  ],
  exports: [VersioningService],
})
export class VersioningModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(VersionNegotiationMiddleware).forRoutes('*');
  }
}
