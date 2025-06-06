import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm"

export enum HoneypotThreatLevel {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  CRITICAL = "critical",
}

export enum HoneypotAccessType {
  ROUTE_ACCESS = "route_access",
  PARAMETER_INJECTION = "parameter_injection",
  HEADER_MANIPULATION = "header_manipulation",
  BRUTE_FORCE = "brute_force",
}

@Entity("honeypot_access_logs")
export class HoneypotAccess {
  @PrimaryGeneratedColumn("uuid")
  id: string

  @Column()
  route: string

  @Column()
  method: string

  @Column({ type: "inet" })
  ipAddress: string

  @Column({ nullable: true })
  userAgent: string

  @Column({ nullable: true })
  referer: string

  @Column({ type: "jsonb" })
  headers: Record<string, string>

  @Column({ type: "jsonb", nullable: true })
  queryParams: Record<string, any>

  @Column({ type: "jsonb", nullable: true })
  body: any

  @Column({
    type: "enum",
    enum: HoneypotAccessType,
    default: HoneypotAccessType.ROUTE_ACCESS,
  })
  accessType: HoneypotAccessType

  @Column({
    type: "enum",
    enum: HoneypotThreatLevel,
    default: HoneypotThreatLevel.MEDIUM,
  })
  threatLevel: HoneypotThreatLevel

  @Column({ type: "text", nullable: true })
  description: string

  @Column({ type: "boolean", default: false })
  isBlocked: boolean

  @Column({ type: "boolean", default: false })
  alertSent: boolean

  @Column({ type: "text", nullable: true })
  geolocation: string

  @Column({ type: "text", nullable: true })
  fingerprint: string

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date
}
