import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    TypeOrmModule.forFeature([DeviceFingerprint, SuspiciousActivity])
  ],
  providers: [FingerprintAnalysisService],
  controllers: [FingerprintAnalysisController],
  exports: [FingerprintAnalysisService]
})
export class FingerprintAnalysisModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(FingerprintAnalysisMiddleware)
      .forRoutes('*'); // Apply to all routes or specify specific routes
  }
}