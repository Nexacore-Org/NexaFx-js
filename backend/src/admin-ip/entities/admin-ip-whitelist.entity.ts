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

export enum IpStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
  EXPIRED = "expired",
  BLOCKED = "blocked",
}

export enum IpType {
  SINGLE = "single",
  RANGE = "range",
  CIDR = "cidr",
  WILDCARD = "wildcard",
}

@Entity("admin_ip_whitelist")
export class AdminIpWhitelist {
  @PrimaryGeneratedColumn("uuid")
  id: string

  @Column({ type: "text" })
  ipAddress: string

  @Column({
    type: "enum",
    enum: IpType,
    default: IpType.SINGLE,
  })
  ipType: IpType

  @Column({ nullable: true })
  description: string

  @Column({
    type: "enum",
    enum: IpStatus,
    default: IpStatus.ACTIVE,
  })
  status: IpStatus

  @Column({ type: "boolean", default: true })
  isActive: boolean

  @Column({ nullable: true })
  expiresAt: Date

  @Column({ type: "int", default: 0 })
  accessCount: number

  @Column({ nullable: true })
  lastAccessAt: Date

  @Column({ type: "inet", nullable: true })
  lastAccessIp: string

  @Column({ type: "text", nullable: true })
  userAgent: string

  @Column({ type: "jsonb", nullable: true })
  metadata: Record<string, any>

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "createdById" })
  createdBy: User

  @Column({ type: "uuid", nullable: true })
  createdById: string

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "lastModifiedById" })
  lastModifiedBy: User

  @Column({ type: "uuid", nullable: true })
  lastModifiedById: string

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date
}
