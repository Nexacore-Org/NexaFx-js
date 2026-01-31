import { Controller, Get, Param, UseGuards, Query } from "@nestjs/common";
import { WalletRiskScoringService } from "../services/wallet-risk-scoring.service";
import {
  RiskScoreResponseDto,
  RiskHistoryResponseDto,
} from "../dto/risk-score-response.dto";
// Import your admin guard
// import { AdminGuard } from '../../auth/guards/admin.guard';

@Controller("wallets")
// @UseGuards(AdminGuard) // Uncomment to protect all endpoints
export class WalletRiskController {
  constructor(private walletRiskScoringService: WalletRiskScoringService) {}

  @Get(":id/risk-score")
  async getRiskScore(
    @Param("id") walletId: string,
  ): Promise<RiskScoreResponseDto> {
    const riskScore =
      await this.walletRiskScoringService.getRiskScore(walletId);

    if (!riskScore) {
      // Calculate if not exists
      const newScore =
        await this.walletRiskScoringService.calculateRiskScore(walletId);
      return this.mapToDto(newScore);
    }

    return this.mapToDto(riskScore);
  }

  @Get(":id/risk-score/history")
  async getRiskHistory(
    @Param("id") walletId: string,
    @Query("limit") limit?: number,
  ): Promise<RiskHistoryResponseDto[]> {
    const history = await this.walletRiskScoringService.getRiskHistory(
      walletId,
      limit ? parseInt(limit.toString()) : 50,
    );

    return history.map((h) => ({
      id: h.id,
      walletId: h.walletId,
      score: parseFloat(h.score.toString()),
      level: h.level,
      reasons: h.reasons,
      createdAt: h.createdAt,
    }));
  }

  @Get("high-risk")
  async getHighRiskWallets(): Promise<RiskScoreResponseDto[]> {
    const highRiskWallets =
      await this.walletRiskScoringService.getAllHighRiskWallets();
    return highRiskWallets.map((w) => this.mapToDto(w));
  }

  private mapToDto(riskScore: any): RiskScoreResponseDto {
    return {
      walletId: riskScore.walletId,
      score: parseFloat(riskScore.score.toString()),
      level: riskScore.level,
      reasons: riskScore.reasons,
      updatedAt: riskScore.updatedAt,
      metadata: riskScore.metadata,
    };
  }
}
