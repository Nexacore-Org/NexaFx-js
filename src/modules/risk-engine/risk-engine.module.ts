import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RiskState } from './entities/risk-state.entity';
import { RiskPosition } from './entities/risk-position.entity';
import { RiskSnapshot } from './entities/risk-snapshot.entity';
import { RiskCalculationService } from './services/risk-calculation.service';
import { StressTestService } from './services/stress-test.service';
import { RiskGuardService } from './services/risk-guard.service';
import { RiskManagerService } from './services/risk-manager.service';
import { RiskController } from './controllers';

@Module({
  imports: [TypeOrmModule.forFeature([RiskState, RiskPosition, RiskSnapshot])],
  controllers: [RiskController],
  providers: [
    RiskCalculationService,
    StressTestService,
    RiskGuardService,
    RiskManagerService,
  ],
  exports: [RiskGuardService, RiskManagerService],
})
export class RiskEngineModule {}
