import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ScheduleModule } from "@nestjs/schedule";
import { WalletRiskScore } from "./entities/wallet-risk-score.entity";
import { WalletRiskHistory } from "./entities/wallet-risk-history.entity";
import { WalletRiskController } from "./controllers/wallet-risk.controller";
import { WalletRiskScoringService } from "./services/wallet-risk-scoring.service";
import { RiskIndicatorsService } from "./services/risk-indicators.service";
import { WalletRiskJobService } from "./services/wallet-risk-job.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([WalletRiskScore, WalletRiskHistory]),
    ScheduleModule.forRoot(),
  ],
  controllers: [WalletRiskController],
  providers: [
    WalletRiskScoringService,
    RiskIndicatorsService,
    WalletRiskJobService,
  ],
  exports: [WalletRiskScoringService],
})
export class WalletRiskModule {}
