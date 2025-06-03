import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MaskingModule } from './common/masking/masking.module';
import { MaskingInterceptor, LoggingMaskingInterceptor } from './common/interceptors/masking.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MaskingModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: MaskingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingMaskingInterceptor,
    },
  ],
})
export class AppModule {}
