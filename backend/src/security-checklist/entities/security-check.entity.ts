import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm"

export enum SecurityCheckStatus {
  PASS = "pass",
  FAIL = "fail",
  WARNING = "warning",
  NOT_APPLICABLE = "not_applicable",
}

export enum SecurityCheckCategory {
  AUTHENTICATION = "authentication",
  AUTHORIZATION = "authorization",
  ENCRYPTION = "encryption",
  NETWORK = "network",
  HEADERS = "headers",
  VALIDATION = "validation",
  LOGGING = "logging",
  CONFIGURATION = "configuration",
  DEPENDENCIES = "dependencies",
}

export enum SecurityCheckSeverity {
  CRITICAL = "critical",
  HIGH = "high",
  MEDIUM = "medium",
  LOW = "low",
  INFO = "info",
}

@Entity("security_checks")
export class SecurityCheck {
  @PrimaryGeneratedColumn("uuid")
  id: string

  @Column()
  name: string

  @Column({ type: "text" })
  description: string

  @Column({
    type: "enum",
    enum: SecurityCheckCategory,
  })
  category: SecurityCheckCategory

  @Column({
    type: "enum",
    enum: SecurityCheckSeverity,
  })
  severity: SecurityCheckSeverity

  @Column({
    type: "enum",
    enum: SecurityCheckStatus,
  })
  status: SecurityCheckStatus

  @Column({ type: "text", nullable: true })
  currentValue: string

  @Column({ type: "text", nullable: true })
  expectedValue: string

  @Column({ type: "text", nullable: true })
  recommendation: string

  @Column({ type: "text", nullable: true })
  remediation: string

  @Column({ type: "jsonb", nullable: true })
  metadata: Record<string, any>

  @Column({ type: "boolean", default: true })
  isEnabled: boolean

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date
}
