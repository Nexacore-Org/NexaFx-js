import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '@nestjs/config';

import { ForwardContract } from './entities/forward-contract.entity';
import { ForwardContractService, EXCHANGE_RATE_PROVIDER } from './services/forward-contract.service';
import { ForwardContractController } from './controllers/forward-contract.controller';
import { ForwardSettlementJob } from './jobs/forward-settlement.job';
import { RiskEngineModule } from '../risk-engine/risk-engine.module';
import { FxConversionsModule } from '../fx/fx.module';
import { RateProviderService } from '../fx/services/rate-provider.service';

@Module({
  imports: [
    ConfigModule,
    ScheduleModule,
    TypeOrmModule.forFeature([ForwardContract]),
    RiskEngineModule,
    FxConversionsModule,
  ],
  providers: [
    ForwardContractService,
    ForwardSettlementJob,
    {
      provide: EXCHANGE_RATE_PROVIDER,
      useExisting: RateProviderService,
    },
  ],
  controllers: [ForwardContractController],
  exports: [ForwardContractService],
})
export class FxForwardContractsModule {}
