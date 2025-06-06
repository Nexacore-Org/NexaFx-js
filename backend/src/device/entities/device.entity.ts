import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from "typeorm"
import { User } from "../../users/entities/user.entity"
import { DeviceSession } from "./device-session.entity"

export enum DeviceType {
  DESKTOP = "desktop",
  MOBILE = "mobile",
  TABLET = "tablet",
  UNKNOWN = "unknown",
}

export enum DeviceStatus {
  TRUSTED = "trusted",
  PENDING = "pending",
  BLOCKED = "blocked",
  SUSPICIOUS = "suspicious",
}

export enum OperatingSystem {
  WINDOWS = "windows",
  MACOS = "macos",
  LINUX = "linux",
  IOS = "ios",
  ANDROID = "android",
  UNKNOWN = "unknown",
}

export enum Browser {
  CHROME = "chrome",
  FIREFOX = "firefox",
  SAFARI = "safari",
  EDGE = "edge",
  OPERA = "opera",
  UNKNOWN = "unknown",
}

@Entity("devices")
export class Device {
  @PrimaryGeneratedColumn("uuid")
  id: string

  @Column({ unique: true })
  fingerprint: string

  @Column({ nullable: true })
  name: string

  @Column({
    type: "enum",
    enum: DeviceType,
    default: DeviceType.UNKNOWN,
  })
  deviceType: DeviceType

  @Column({
    type: "enum",
    enum: OperatingSystem,
    default: OperatingSystem.UNKNOWN,
  })
  operatingSystem: OperatingSystem

  @Column({
    type: "enum",
    enum: Browser,
    default: Browser.UNKNOWN,
  })
  browser: Browser

  @Column({ nullable: true })
  browserVersion: string

  @Column({ nullable: true })
  osVersion: string

  @Column({ type: "text", nullable: true })
  userAgent: string

  @Column({ type: "inet", nullable: true })
  lastIpAddress: string

  @Column({ nullable: true })
  lastLocation: string

  @Column({
    type: "enum",
    enum: DeviceStatus,
    default: DeviceStatus.PENDING,
  })
  status: DeviceStatus

  @Column({ type: "boolean", default: false })
  isTrusted: boolean

  @Column({ type: "boolean", default: false })
  isBlocked: boolean

  @Column({ type: "int", default: 0 })
  loginCount: number

  @Column({ type: "int", default: 0 })
  failedLoginCount: number

  @Column({ nullable: true })
  lastLoginAt: Date

  @Column({ nullable: true })
  lastFailedLoginAt: Date

  @Column({ nullable: true })
  trustedAt: Date

  @Column({ nullable: true })
  blockedAt: Date

  @Column({ type: "text", nullable: true })
  blockReason: string

  @Column({ type: "jsonb", nullable: true })
  metadata: Record<string, any>

  @Column({ type: "jsonb", nullable: true })
  capabilities: Record<string, any>

  @ManyToOne(
    () => User,
    (user) => user.devices,
  )
  @JoinColumn({ name: "userId" })
  user: User

  @Column({ type: "uuid" })
  userId: string

  @OneToMany(
    () => DeviceSession,
    (session) => session.device,
  )
  sessions: DeviceSession[]

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date
}
