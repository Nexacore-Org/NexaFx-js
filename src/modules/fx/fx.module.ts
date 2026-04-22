import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ConfigModule } from '@nestjs/config';

import { FxAggregatorService } from './fx-aggregator.service';
import { OrderBookService } from './services/order-book.service';

// Forward contracts (issue #482)
import { FxForwardContract } from './entities/fx-forward-contract.entity';
import { FxForwardContractService } from './services/fx-forward-contract.service';
import { FxExposureService } from './services/fx-exposure.service';
import { FxForwardSettlementJob } from './jobs/fx-forward-settlement.job';
import { FxForwardContractController } from './controllers/fx-forward-contract.controller';

// FX Alerts (from main)
import { FxAlertService } from './services/fx-alert.service';
import { FxAlert } from './entities/fx-alert.entity';
import { FxAlertHistory } from './entities/fx-alert-history.entity';
import { FxTargetOrder } from './entities/fx-target-order.entity';
import { FxAlertController } from './controllers/fx-alert.controller';
import { AdminFxAlertController } from './controllers/admin-fx-alert.controller';

@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    TypeOrmModule.forFeature([FxForwardContract, FxAlert, FxAlertHistory, FxTargetOrder]),
  ],
  controllers: [FxForwardContractController, FxAlertController, AdminFxAlertController],
  providers: [
    FxAggregatorService,
    OrderBookService,
    FxForwardContractService,
    FxExposureService,
    FxForwardSettlementJob,
    FxAlertService,
  ],
  exports: [FxAggregatorService, OrderBookService, FxForwardContractService, FxExposureService, FxAlertService],
})
export class FxModule {}
