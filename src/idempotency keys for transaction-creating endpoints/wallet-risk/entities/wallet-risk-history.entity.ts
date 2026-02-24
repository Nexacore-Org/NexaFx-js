import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from "typeorm";

@Entity("wallet_risk_history")
@Index(["walletId", "createdAt"])
export class WalletRiskHistory {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar" })
  walletId: string;

  @Column({ type: "decimal", precision: 5, scale: 2 })
  score: number;

  @Column({ type: "enum", enum: RiskLevel })
  level: RiskLevel;

  @Column({ type: "jsonb", default: [] })
  reasons: RiskReason[];

  @CreateDateColumn()
  createdAt: Date;
}
