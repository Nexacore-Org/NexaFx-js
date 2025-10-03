import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MaskingModule } from './common/masking/masking.module';
import { CspModule } from './csp/csp.module';
import { CsrfModule } from './csrf/csrf.module';
import { ValidationModule } from './validation/validation.module';
import {
  MaskingInterceptor,
  LoggingMaskingInterceptor,
} from './common/interceptors/masking.interceptor';
import { RecoveryModule } from './recovery/recovery.module';
import { SecurityHeaderModule } from './security-header/security-header.module';
import { FileUploadModule } from './file-upload/file-upload.module';
import { NotificationsModule } from './notifications/notifications.module';
import { RedisModule } from './common/redis/redis.module';
import { CurrenciesModule } from './currencies/currencies.module';
import { ExchangeRatesModule } from './exchange-rates/exchange-rates.module';
import { MultiCurrencyWalletModule } from './wallets/multi-currency-wallet.module';
import { ConversionsModule } from './conversions/conversions.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    MaskingModule,
    RecoveryModule,
    SecurityHeaderModule,
    ValidationModule,
    FileUploadModule,
    CspModule,
    CsrfModule,
    NotificationsModule,
    RedisModule,
    CurrenciesModule,
    ExchangeRatesModule,
    MultiCurrencyWalletModule,
    ConversionsModule,
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
