import { RiskLevel, RiskReason } from "../entities/wallet-risk-score.entity";

export class RiskScoreResponseDto {
  walletId: string;
  score: number;
  level: RiskLevel;
  reasons: RiskReason[];
  updatedAt: Date;
  metadata?: Record<string, any>;
}

export class RiskHistoryResponseDto {
  id: string;
  walletId: string;
  score: number;
  level: RiskLevel;
  reasons: RiskReason[];
  createdAt: Date;
}
