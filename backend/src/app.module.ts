import { Module } from '@nestjs/common';
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
import { SecurityModule } from './security/security.module';


@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    SecurityModule.forRoot({
      windowMs: 60 * 1000, // 1 minute
      max: 100, // limit each IP to 100 requests per windowMs
    }),
    MaskingModule,
    RecoveryModule,
    SecurityHeaderModule,
    ValidationModule,
    FileUploadModule,
    CspModule,
    CsrfModule,
    NotificationsModule,
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
