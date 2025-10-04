import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { SecureHeadersMiddleware } from './secure-headers.middleware';

@Module({})
export class SecureHeadersModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(SecureHeadersMiddleware).forRoutes('*');
  }
}
