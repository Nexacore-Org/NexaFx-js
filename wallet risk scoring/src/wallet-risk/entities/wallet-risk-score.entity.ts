import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

export enum RiskLevel {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  CRITICAL = "CRITICAL",
}

export interface RiskReason {
  indicator: string;
  weight: number;
  description: string;
  detectedAt: Date;
}

@Entity("wallet_risk_scores")
@Index(["walletId"])
@Index(["level"])
export class WalletRiskScore {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar", unique: true })
  walletId: string;

  @Column({ type: "decimal", precision: 5, scale: 2, default: 0 })
  score: number;

  @Column({ type: "enum", enum: RiskLevel, default: RiskLevel.LOW })
  level: RiskLevel;

  @Column({ type: "jsonb", default: [] })
  reasons: RiskReason[];

  @Column({ type: "jsonb", nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
