import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm"

export enum WebhookStatus {
  SUCCESS = "success",
  FAILED = "failed",
  REJECTED = "rejected",
}

export enum WebhookProvider {
  STRIPE = "stripe",
  PAYPAL = "paypal",
  GITHUB = "github",
  SLACK = "slack",
  CUSTOM = "custom",
}

@Entity("webhook_logs")
export class WebhookLog {
  @PrimaryGeneratedColumn("uuid")
  id: string

  @Column({
    type: "enum",
    enum: WebhookProvider,
    default: WebhookProvider.CUSTOM,
  })
  provider: WebhookProvider

  @Column()
  endpoint: string

  @Column()
  method: string

  @Column({ type: "jsonb" })
  headers: Record<string, string>

  @Column({ type: "jsonb", nullable: true })
  payload: any

  @Column({
    type: "enum",
    enum: WebhookStatus,
    default: WebhookStatus.SUCCESS,
  })
  status: WebhookStatus

  @Column({ type: "text", nullable: true })
  errorMessage: string

  @Column({ nullable: true })
  signature: string

  @Column({ type: "bigint" })
  timestamp: number

  @Column({ type: "int", default: 0 })
  processingTimeMs: number

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date
}
