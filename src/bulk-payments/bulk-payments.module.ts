import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BulkPaymentEntity } from './entities/bulk-payment.entity';
import { BulkPaymentItemEntity } from './entities/bulk-payment-item.entity';
import { TransactionEntity } from '../modules/transactions/entities/transaction.entity';
import { BulkPaymentsService } from './bulk-payments.service';
import { BulkPaymentsController } from './bulk-payments.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([BulkPaymentEntity, BulkPaymentItemEntity, TransactionEntity]),
    EventEmitterModule.forRoot(),
  ],
  controllers: [BulkPaymentsController],
  providers: [BulkPaymentsService],
  exports: [BulkPaymentsService],
})
export class BulkPaymentsModule {}
