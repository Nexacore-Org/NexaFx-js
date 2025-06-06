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

export enum SessionStatus {
  ACTIVE = "active",
  EXPIRED = "expired",
  TERMINATED = "terminated",
  SUSPICIOUS = "suspicious",
}

export enum SessionType {
  WEB = "web",
  MOBILE_APP = "mobile_app",
  API = "api",
  UNKNOWN = "unknown",
}

@Entity("device_sessions")
export class DeviceSession {
  @PrimaryGeneratedColumn("uuid")
  id: string

  @Column({ unique: true })
  sessionToken: string

  @Column({
    type: "enum",
    enum: SessionStatus,
    default: SessionStatus.ACTIVE,
  })
  status: SessionStatus

  @Column({
    type: "enum",
    enum: SessionType,
    default: SessionType.WEB,
  })
  sessionType: SessionType

  @Column({ type: "inet" })
  ipAddress: string

  @Column({ nullable: true })
  location: string

  @Column({ type: "text", nullable: true })
  userAgent: string

  @Column({ nullable: true })
  expiresAt: Date

  @Column({ nullable: true })
  lastActivityAt: Date

  @Column({ type: "boolean", default: false })
  isAnomalous: boolean

  @Column({ type: "text", nullable: true })
  anomalyReason: string

  @Column({ type: "float", default: 0 })
  riskScore: number

  @Column({ type: "jsonb", nullable: true })
  metadata: Record<string, any>

  @ManyToOne(
    () => Device,
    (device) => device.sessions,
  )
  @JoinColumn({ name: "deviceId" })
  device: Device

  @Column({ type: "uuid" })
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
