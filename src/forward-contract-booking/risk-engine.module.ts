import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ExposureService } from './exposure.service';

@Module({
  imports: [ConfigModule],
  providers: [ExposureService],
  exports: [ExposureService],
})
export class RiskEngineModule {}
