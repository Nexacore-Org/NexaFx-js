import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToMany,
  JoinTable,
} from "typeorm"
import { Role } from "./role.entity"

@Entity("users")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id: string

  @Column({ unique: true })
  email: string

  @Column()
  firstName: string

  @Column()
  lastName: string

  @Column()
  passwordHash: string

  @Column({ default: true })
  isActive: boolean

  @Column({ type: "timestamp", nullable: true })
  lastLoginAt?: Date

  @Column({ nullable: true })
  department?: string

  @Column({ type: "json", nullable: true })
  metadata?: Record<string, any>

  @ManyToMany(
    () => Role,
    (role) => role.users,
    { eager: true },
  )
  @JoinTable({
    name: "user_roles",
    joinColumn: { name: "user_id", referencedColumnName: "id" },
    inverseJoinColumn: { name: "role_id", referencedColumnName: "id" },
  })
  roles: Role[]

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date

  // Helper method to get all permissions
  getAllPermissions(): string[] {
    const permissions = new Set<string>()
    this.roles?.forEach((role) => {
      role.permissions?.forEach((permission) => {
        permissions.add(permission.name)
      })
    })
    return Array.from(permissions)
  }

  // Helper method to check if user has specific role
  hasRole(roleName: string): boolean {
    return this.roles?.some((role) => role.name === roleName) || false
  }

  // Helper method to check if user has specific permission
  hasPermission(permissionName: string): boolean {
    return this.getAllPermissions().includes(permissionName)
  }
}
