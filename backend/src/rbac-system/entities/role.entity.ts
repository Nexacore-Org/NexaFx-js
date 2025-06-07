import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToMany,
  JoinTable,
} from "typeorm"
import { User } from "./user.entity"
import { Permission } from "./permission.entity"

@Entity("roles")
export class Role {
  @PrimaryGeneratedColumn("uuid")
  id: string

  @Column({ unique: true })
  name: string

  @Column()
  displayName: string

  @Column({ nullable: true })
  description?: string

  @Column({ default: true })
  isActive: boolean

  @Column({ default: false })
  isSystem: boolean // System roles cannot be deleted

  @Column({ type: "json", nullable: true })
  metadata?: Record<string, any>

  @ManyToMany(
    () => User,
    (user) => user.roles,
  )
  users: User[]

  @ManyToMany(
    () => Permission,
    (permission) => permission.roles,
    { eager: true },
  )
  @JoinTable({
    name: "role_permissions",
    joinColumn: { name: "role_id", referencedColumnName: "id" },
    inverseJoinColumn: { name: "permission_id", referencedColumnName: "id" },
  })
  permissions: Permission[]

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date

  // Helper method to check if role has specific permission
  hasPermission(permissionName: string): boolean {
    return this.permissions?.some((permission) => permission.name === permissionName) || false
  }
}
