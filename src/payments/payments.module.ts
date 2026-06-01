import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PaymentProviderService } from './payment-provider.service';
import { PaymentsController } from './payments.controller';

@Module({
  imports: [ConfigModule],
  controllers: [PaymentsController],
  providers: [PaymentProviderService],
  exports: [PaymentProviderService],
})
export class PaymentsModule {}
