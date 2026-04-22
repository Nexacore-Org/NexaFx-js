import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ConfigModule } from '@nestjs/config';

import { FxAggregatorService } from './fx-aggregator.service';
import { OrderBookService } from './services/order-book.service';
import { FxForwardContract } from './entities/fx-forward-contract.entity';
import { FxForwardContractService } from './services/fx-forward-contract.service';
import { FxExposureService } from './services/fx-exposure.service';
import { FxForwardSettlementJob } from './jobs/fx-forward-settlement.job';
import { FxForwardContractController } from './controllers/fx-forward-contract.controller';

@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    TypeOrmModule.forFeature([FxForwardContract]),
  ],
  providers: [
    FxAggregatorService,
    OrderBookService,
    FxForwardContractService,
    FxExposureService,
    FxForwardSettlementJob,
  ],
  controllers: [FxForwardContractController],
  exports: [FxAggregatorService, OrderBookService, FxForwardContractService, FxExposureService],
})
export class FxModule {}
