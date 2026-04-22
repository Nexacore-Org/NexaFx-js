import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SplitPayment } from './entities/split-payment.entity';
import { SplitContribution } from './entities/split-contribution.entity';
import { SplitPaymentService } from './services/split-payment.service';
import { SplitPaymentController } from './controllers/split-payment.controller';
import { SplitPaymentAdminController } from './controllers/split-payment-admin.controller';
import { SplitExpiryJob } from './jobs/split-expiry.job';

@Module({
  imports: [TypeOrmModule.forFeature([SplitPayment, SplitContribution])],
  controllers: [SplitPaymentController, SplitPaymentAdminController],
  providers: [SplitPaymentService, SplitExpiryJob],
  exports: [SplitPaymentService],
})
export class SplitPaymentsModule {}
