/**
 * PATCH — Add the following to your existing TransactionsModule:
 *
 * 1. Import RiskEngineModule
 * 2. Register RiskPreTradeGuard as a provider
 * 3. Emit TRADE_COMPLETED_EVENT after trade completion in the service
 *
 * Minimal diff shown below — merge with your existing module file.
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Trade } from './entities/trade.entity';
import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';
import { RiskEngineModule } from '../risk-engine/risk-engine.module';
import { RiskPreTradeGuard } from './guards/risk-pre-trade.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([Trade]),
    EventEmitterModule.forRoot(),
    RiskEngineModule, // <── brings in RiskGuardService and RiskManagerService
  ],
  providers: [
    TransactionsService,
    RiskPreTradeGuard, // <── register so NestJS DI can inject it
  ],
  controllers: [TransactionsController],
  exports: [TransactionsService],
})
export class TransactionsModule {}