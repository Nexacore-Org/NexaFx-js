import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToMany } from "typeorm"
import { Role } from "./role.entity"

@Entity("permissions")
export class Permission {
  @PrimaryGeneratedColumn("uuid")
  id: string

  @Column({ unique: true })
  name: string

  @Column()
  displayName: string

  @Column({ nullable: true })
  description?: string

  @Column({ nullable: true })
  resource?: string // e.g., 'users', 'posts', 'orders'

  @Column({ nullable: true })
  action?: string // e.g., 'create', 'read', 'update', 'delete'

  @Column({ default: true })
  isActive: boolean

  @Column({ default: false })
  isSystem: boolean // System permissions cannot be deleted

  @Column({ type: "json", nullable: true })
  metadata?: Record<string, any>

  @ManyToMany(
    () => Role,
    (role) => role.permissions,
  )
  roles: Role[]

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date
}
