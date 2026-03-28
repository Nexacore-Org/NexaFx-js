import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RiskState } from './entities/risk-state.entity';
import { RiskPosition } from './entities/risk-position.entity';
import { RiskSnapshot } from './entities/risk-snapshot.entity';
import { RiskCalculationService } from './services/risk-calculation.service';
import { StressTestService } from './services/stress-test.service';
import { RiskGuardService } from './services/risk-guard.service';
import { RiskManagerService } from './services/risk-manager.service';
import { RiskController } from './controllers';
import { RiskAnalyticsController } from './controllers/risk-analytics.controller';
import { RiskAdminAnalyticsController } from './controllers/risk-admin-analytics.controller';
import { RiskAnalyticsService } from './services/risk-analytics.service';
import { TransactionEntity } from '../transactions/entities/transaction.entity';
import { TransactionRiskEntity } from '../transactions/entities/transaction-risk.entity';
import { RiskIndicatorsService } from '../risk/services/risk-indicators.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { AlertingService } from './services/alerting.service';
import { ExposureService } from './exposure.service';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    TypeOrmModule.forFeature([
      RiskState,
      RiskPosition,
      RiskSnapshot,
      TransactionEntity,
      TransactionRiskEntity,
    ]),
    NotificationsModule,
  ],
  controllers: [RiskController, RiskAnalyticsController, RiskAdminAnalyticsController],
  providers: [
    RiskCalculationService,
    StressTestService,
    RiskGuardService,
    RiskManagerService,
    RiskIndicatorsService,
    AlertingService,
    ExposureService,
    RiskAnalyticsService,
  ],
  exports: [
    RiskGuardService,
    RiskManagerService,
    RiskIndicatorsService,
    AlertingService,
    ExposureService,
  ],
})
export class RiskEngineModule {}
