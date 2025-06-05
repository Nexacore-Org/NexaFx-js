import { Module, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [SecureApiController],
  providers: [HmacService, HmacGuard],
  exports: [HmacService],
})
export class HmacIntegrityModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RawBodyMiddleware)
      .forRoutes(
        { path: 'api/critical-operation', method: RequestMethod.POST },
        { path: 'api/webhook', method: RequestMethod.POST }
      );
  }
}
