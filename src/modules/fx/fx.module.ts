import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { FxAggregatorService } from './fx-aggregator.service';
import { OrderBookService } from './services/order-book.service';
import { FxAlertService } from './services/fx-alert.service';
import { FxAlert } from './entities/fx-alert.entity';
import { FxAlertHistory } from './entities/fx-alert-history.entity';
import { FxTargetOrder } from './entities/fx-target-order.entity';
import { FxAlertController } from './controllers/fx-alert.controller';
import { AdminFxAlertController } from './controllers/admin-fx-alert.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([FxAlert, FxAlertHistory, FxTargetOrder]),
    ScheduleModule.forRoot(),
  ],
  controllers: [FxAlertController, AdminFxAlertController],
  providers: [FxAggregatorService, OrderBookService, FxAlertService],
  exports: [FxAggregatorService, OrderBookService, FxAlertService],
})
export class FxModule {}
