import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from "typeorm"

@Entity("api_keys")
export class ApiKey {
  @PrimaryGeneratedColumn("uuid")
  id: string

  @Column({ unique: true })
  @Index()
  key: string

  @Column()
  name: string

  @Column({ nullable: true })
  description?: string

  @Column({ default: true })
  isActive: boolean

  @Column({ type: "timestamp", nullable: true })
  expiresAt?: Date

  @Column({ type: "timestamp", nullable: true })
  lastUsedAt?: Date

  @Column({ default: 0 })
  usageCount: number

  @Column({ type: "json", nullable: true })
  scopes?: string[]

  @Column({ nullable: true })
  userId?: string

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date
}
