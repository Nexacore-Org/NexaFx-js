import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '@nestjs/config';

import { ForwardContract } from './entities/forward-contract.entity';
import { ForwardContractService, EXCHANGE_RATE_PROVIDER } from './services/forward-contract.service';
import { ForwardContractController } from './controllers/forward-contract.controller';
import { ForwardSettlementJob } from './jobs/forward-settlement.job';
import { RiskEngineModule } from '../risk-engine/risk-engine.module';

// ─── Exchange rate provider ───────────────────────────────────────────────────
//
// Swap this factory for a direct import of your real ExchangeRatesService once
// you've connected the modules.  The token EXCHANGE_RATE_PROVIDER keeps the
// ForwardContractService decoupled from any specific rate implementation.
//
// Example wiring with the real service:
//
//   import { ExchangeRatesModule } from '../../exchange-rates/exchange-rates.module';
//   import { ExchangeRatesService } from '../../exchange-rates/exchange-rates.service';
//
//   Then add ExchangeRatesModule to imports[] and replace the factory below with:
//   {
//     provide: EXCHANGE_RATE_PROVIDER,
//     useExisting: ExchangeRatesService,
//   }
//
// For now we ship a stub provider so the module compiles without the real service.
// ─────────────────────────────────────────────────────────────────────────────

const ExchangeRateProviderStub = {
  provide: EXCHANGE_RATE_PROVIDER,
  useValue: {
    async getCurrentRate(base: string, quote: string): Promise<number> {
      // STUB — replace with real ExchangeRatesService
      throw new Error(
        `ExchangeRateProviderStub: wire a real rate provider for ${base}/${quote}`,
      );
    },
  },
};

@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([ForwardContract]),
    RiskEngineModule,
  ],
  providers: [
    ForwardContractService,
    ForwardSettlementJob,
    ExchangeRateProviderStub,
  ],
  controllers: [ForwardContractController],
  exports: [ForwardContractService],
})
export class FxModule {}
