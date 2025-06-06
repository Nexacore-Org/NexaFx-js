import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm"
import { Device } from "./device.entity"
import { User } from "../../users/entities/user.entity"

export enum AnomalyType {
  NEW_DEVICE = "new_device",
  LOCATION_CHANGE = "location_change",
  UNUSUAL_TIME = "unusual_time",
  RAPID_LOGINS = "rapid_logins",
  SUSPICIOUS_BEHAVIOR = "suspicious_behavior",
  DEVICE_CHANGE = "device_change",
  IP_CHANGE = "ip_change",
}

export enum AnomalySeverity {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  CRITICAL = "critical",
}

export enum AnomalyStatus {
  DETECTED = "detected",
  INVESTIGATING = "investigating",
  RESOLVED = "resolved",
  FALSE_POSITIVE = "false_positive",
}

@Entity("device_anomalies")
export class DeviceAnomaly {
  @PrimaryGeneratedColumn("uuid")
  id: string

  @Column({
    type: "enum",
    enum: AnomalyType,
  })
  anomalyType: AnomalyType

  @Column({
    type: "enum",
    enum: AnomalySeverity,
    default: AnomalySeverity.MEDIUM,
  })
  severity: AnomalySeverity

  @Column({
    type: "enum",
    enum: AnomalyStatus,
    default: AnomalyStatus.DETECTED,
  })
  status: AnomalyStatus

  @Column({ type: "text" })
  description: string

  @Column({ type: "float", default: 0 })
  riskScore: number

  @Column({ type: "inet", nullable: true })
  ipAddress: string

  @Column({ nullable: true })
  location: string

  @Column({ type: "text", nullable: true })
  userAgent: string

  @Column({ type: "jsonb", nullable: true })
  metadata: Record<string, any>

  @Column({ type: "boolean", default: false })
  alertSent: boolean

  @Column({ type: "boolean", default: false })
  actionTaken: boolean

  @Column({ type: "text", nullable: true })
  actionDescription: string

  @Column({ nullable: true })
  resolvedAt: Date

  @Column({ type: "text", nullable: true })
  resolutionNotes: string

  @ManyToOne(() => Device, { nullable: true })
  @JoinColumn({ name: "deviceId" })
  device: Device

  @Column({ type: "uuid", nullable: true })
  deviceId: string

  @ManyToOne(() => User)
  @JoinColumn({ name: "userId" })
  user: User

  @Column({ type: "uuid" })
  userId: string

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date
}
