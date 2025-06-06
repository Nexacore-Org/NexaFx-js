import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from "typeorm"
import { AdminIpWhitelist } from "./admin-ip-whitelist.entity"
import { User } from "../../users/entities/user.entity"

export enum AccessResult {
  ALLOWED = "allowed",
  DENIED = "denied",
  BLOCKED = "blocked",
  EXPIRED = "expired",
}

export enum AccessType {
  ADMIN_LOGIN = "admin_login",
  ADMIN_PANEL = "admin_panel",
  API_ACCESS = "api_access",
  SYSTEM_ACCESS = "system_access",
}

@Entity("admin_ip_access_logs")
export class AdminIpAccessLog {
  @PrimaryGeneratedColumn("uuid")
  id: string

  @Column({ type: "inet" })
  ipAddress: string

  @Column({
    type: "enum",
    enum: AccessResult,
  })
  accessResult: AccessResult

  @Column({
    type: "enum",
    enum: AccessType,
    default: AccessType.ADMIN_PANEL,
  })
  accessType: AccessType

  @Column({ type: "text" })
  requestPath: string

  @Column({ type: "text" })
  requestMethod: string

  @Column({ type: "text", nullable: true })
  userAgent: string

  @Column({ type: "text", nullable: true })
  referer: string

  @Column({ type: "jsonb", nullable: true })
  headers: Record<string, string>

  @Column({ type: "text", nullable: true })
  denialReason: string

  @Column({ type: "text", nullable: true })
  location: string

  @Column({ type: "jsonb", nullable: true })
  metadata: Record<string, any>

  @ManyToOne(() => AdminIpWhitelist, { nullable: true })
  @JoinColumn({ name: "whitelistEntryId" })
  whitelistEntry: AdminIpWhitelist

  @Column({ type: "uuid", nullable: true })
  whitelistEntryId: string

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "userId" })
  user: User

  @Column({ type: "uuid", nullable: true })
  userId: string

  @CreateDateColumn()
  createdAt: Date
}
