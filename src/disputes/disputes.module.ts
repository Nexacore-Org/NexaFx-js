import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { DisputeEntity } from './entities/dispute.entity';
import { DisputeMessageEntity } from './entities/dispute-message.entity';
import { Dispute } from './dispute.entity';
import { DisputesService } from './disputes.service';
import { DisputesController } from './disputes.controller';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DisputeEntity, DisputeMessageEntity, Dispute]),
    EventEmitterModule.forRoot(),
    TransactionsModule,
  ],
  controllers: [DisputesController],
  providers: [DisputesService],
  exports: [DisputesService],
})
export class DisputesModule {}
