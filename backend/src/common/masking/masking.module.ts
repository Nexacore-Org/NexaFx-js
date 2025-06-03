import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MaskingInterceptor, LoggingMaskingInterceptor } from '../interceptors/masking.interceptor';
import { MaskingService } from './masking.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    MaskingInterceptor,
    LoggingMaskingInterceptor,
    MaskingService,
    {
      provide: 'MASKING_OPTIONS',
      useFactory: () => ({
        sensitiveFields: ['password', 'token', 'secret', 'apiKey', 'privateKey'],
        maskChar: '*',
        preserveLength: true,
        customMasks: {
          email: (value: string) => {
            const [local, domain] = value.split('@');
            return `${local.charAt(0)}***@${domain}`;
          },
          creditCard: (value: string) => {
            return `****-****-****-${value.slice(-4)}`;
          }
        }
      })
    }
  ],
  exports: [MaskingInterceptor, LoggingMaskingInterceptor, MaskingService]
})
export class MaskingModule {}