import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { GeoipController } from './geoip.controller';
import { GeoipService } from './geoip.service';
import { GeoipInterceptor } from './geoip.interceptor';

@Module({
  imports: [
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 5,
    }),
  ],
  controllers: [GeoipController],
  providers: [GeoipService, GeoipInterceptor],
  exports: [GeoipService, GeoipInterceptor],
})
export class GeoipModule {}