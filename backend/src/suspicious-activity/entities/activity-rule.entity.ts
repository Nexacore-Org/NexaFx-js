import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm"
import { ActivityType, SeverityLevel, ActionTaken } from "./suspicious-activity.entity"

export enum RuleType {
  FREQUENCY = "frequency",
  THRESHOLD = "threshold",
  PATTERN = "pattern",
  ANOMALY = "anomaly",
  LOCATION = "location",
  TIME = "time",
  COMBINATION = "combination",
}

export enum RuleStatus {
  ACTIVE = "active",
  DISABLED = "disabled",
  TESTING = "testing",
}

@Entity("activity_rules")
export class ActivityRule {
  @PrimaryGeneratedColumn("uuid")
  id: string

  @Column()
  name: string

  @Column({ type: "text" })
  description: string

  @Column({
    type: "enum",
    enum: RuleType,
  })
  ruleType: RuleType

  @Column({
    type: "enum",
    enum: ActivityType,
    array: true,
  })
  activityTypes: ActivityType[]

  @Column({
    type: "enum",
    enum: SeverityLevel,
    default: SeverityLevel.MEDIUM,
  })
  severityLevel: SeverityLevel

  @Column({
    type: "enum",
    enum: ActionTaken,
    array: true,
    default: [ActionTaken.LOGGED],
  })
  actions: ActionTaken[]

  @Column({ type: "jsonb" })
  conditions: Record<string, any>

  @Column({ type: "int", default: 0 })
  threshold: number

  @Column({ type: "int", default: 60 })
  timeWindowMinutes: number

  @Column({ type: "float", default: 0 })
  riskScoreMultiplier: number

  @Column({
    type: "enum",
    enum: RuleStatus,
    default: RuleStatus.ACTIVE,
  })
  status: RuleStatus

  @Column({ type: "boolean", default: false })
  isSystem: boolean

  @Column({ type: "jsonb", nullable: true })
  metadata: Record<string, any>

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date
}
