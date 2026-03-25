import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { FxAggregatorService } from './fx-aggregator.service';
import { OrderBookService } from './services/order-book.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [FxAggregatorService, OrderBookService],
  exports: [FxAggregatorService, OrderBookService],
})
export class FxModule {}
