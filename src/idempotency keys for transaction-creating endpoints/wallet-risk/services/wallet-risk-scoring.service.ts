import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  WalletRiskScore,
  RiskLevel,
  RiskReason,
} from "../entities/wallet-risk-score.entity";
import { WalletRiskHistory } from "../entities/wallet-risk-history.entity";
import { RiskIndicatorsService } from "./risk-indicators.service";
import { RiskCalculationContext } from "../interfaces/risk-indicator.interface";

@Injectable()
export class WalletRiskScoringService {
  private readonly logger = new Logger(WalletRiskScoringService.name);

  constructor(
    @InjectRepository(WalletRiskScore)
    private riskScoreRepo: Repository<WalletRiskScore>,
    @InjectRepository(WalletRiskHistory)
    private riskHistoryRepo: Repository<WalletRiskHistory>,
    private riskIndicatorsService: RiskIndicatorsService,
  ) {}

  async calculateRiskScore(walletId: string): Promise<WalletRiskScore> {
    this.logger.log(`Calculating risk score for wallet: ${walletId}`);

    const context: RiskCalculationContext = {
      walletId,
      timeWindowHours: 24,
    };

    // Evaluate all risk indicators
    const indicators =
      await this.riskIndicatorsService.evaluateAllIndicators(context);

    // Calculate total score
    const totalScore = indicators
      .filter((ind) => ind.triggered)
      .reduce((sum, ind) => sum + ind.weight, 0);

    // Determine risk level
    const level = this.determineRiskLevel(totalScore);

    // Build reasons array
    const reasons: RiskReason[] = indicators
      .filter((ind) => ind.triggered)
      .map((ind) => ({
        indicator: ind.indicator,
        weight: ind.weight,
        description: ind.description,
        detectedAt: new Date(),
      }));

    // Update or create risk score
    let riskScore = await this.riskScoreRepo.findOne({ where: { walletId } });

    if (riskScore) {
      riskScore.score = totalScore;
      riskScore.level = level;
      riskScore.reasons = reasons;
      riskScore.updatedAt = new Date();
    } else {
      riskScore = this.riskScoreRepo.create({
        walletId,
        score: totalScore,
        level,
        reasons,
      });
    }

    const savedScore = await this.riskScoreRepo.save(riskScore);

    // Save to history
    await this.saveToHistory(savedScore);

    this.logger.log(
      `Risk score calculated for wallet ${walletId}: ${totalScore} (${level})`,
    );

    return savedScore;
  }

  private determineRiskLevel(score: number): RiskLevel {
    if (score >= 75) return RiskLevel.CRITICAL;
    if (score >= 50) return RiskLevel.HIGH;
    if (score >= 25) return RiskLevel.MEDIUM;
    return RiskLevel.LOW;
  }

  private async saveToHistory(riskScore: WalletRiskScore): Promise<void> {
    const history = this.riskHistoryRepo.create({
      walletId: riskScore.walletId,
      score: riskScore.score,
      level: riskScore.level,
      reasons: riskScore.reasons,
    });

    await this.riskHistoryRepo.save(history);
  }

  async getRiskScore(walletId: string): Promise<WalletRiskScore | null> {
    return this.riskScoreRepo.findOne({ where: { walletId } });
  }

  async getRiskHistory(
    walletId: string,
    limit: number = 50,
  ): Promise<WalletRiskHistory[]> {
    return this.riskHistoryRepo.find({
      where: { walletId },
      order: { createdAt: "DESC" },
      take: limit,
    });
  }

  async getAllHighRiskWallets(): Promise<WalletRiskScore[]> {
    return this.riskScoreRepo.find({
      where: [{ level: RiskLevel.HIGH }, { level: RiskLevel.CRITICAL }],
      order: { score: "DESC" },
    });
  }
}
