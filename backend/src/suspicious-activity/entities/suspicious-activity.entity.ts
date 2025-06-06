import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm"
import { User } from "../../users/entities/user.entity"

export enum ActivityType {
  LOGIN_ATTEMPT = "login_attempt",
  FAILED_LOGIN = "failed_login",
  PASSWORD_CHANGE = "password_change",
  PROFILE_UPDATE = "profile_update",
  FINANCIAL_TRANSACTION = "financial_transaction",
  PERMISSION_CHANGE = "permission_change",
  API_ACCESS = "api_access",
  RESOURCE_ACCESS = "resource_access",
  DATA_EXPORT = "data_export",
  SETTINGS_CHANGE = "settings_change",
  ACCOUNT_RECOVERY = "account_recovery",
  BULK_OPERATION = "bulk_operation",
}

export enum SeverityLevel {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  CRITICAL = "critical",
}

export enum ActionTaken {
  NONE = "none",
  LOGGED = "logged",
  ALERTED = "alerted",
  BLOCKED = "blocked",
  ACCOUNT_LOCKED = "account_locked",
  ADMIN_NOTIFIED = "admin_notified",
  USER_NOTIFIED = "user_notified",
  MFA_REQUIRED = "mfa_required",
}

@Entity("suspicious_activities")
export class SuspiciousActivity {
  @PrimaryGeneratedColumn("uuid")
  id: string

  @Column({
    type: "enum",
    enum: ActivityType,
  })
  activityType: ActivityType

  @Column({ type: "text" })
  description: string

  @Column({
    type: "enum",
    enum: SeverityLevel,
    default: SeverityLevel.MEDIUM,
  })
  severityLevel: SeverityLevel

  @Column({ type: "jsonb", nullable: true })
  metadata: Record<string, any>

  @Column({ type: "inet" })
  ipAddress: string

  @Column({ nullable: true })
  userAgent: string

  @Column({ nullable: true })
  deviceFingerprint: string

  @Column({ nullable: true })
  geolocation: string

  @Column({ type: "jsonb", nullable: true })
  riskFactors: string[]

  @Column({ type: "float", default: 0 })
  riskScore: number

  @Column({ type: "boolean", default: false })
  isResolved: boolean

  @Column({ type: "text", nullable: true })
  resolutionNotes: string

  @Column({ nullable: true })
  resolvedAt: Date

  @Column({ nullable: true })
  resolvedById: string

  @Column({
    type: "enum",
    enum: ActionTaken,
    default: ActionTaken.LOGGED,
    array: true,
  })
  actionsTaken: ActionTaken[]

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "userId" })
  user: User

  @Column({ type: "uuid", nullable: true })
  userId: string

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date
}
