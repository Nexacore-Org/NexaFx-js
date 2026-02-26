import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToMany,
  Index,
} from 'typeorm';
import { Role } from './role.entity';

export enum PermissionAction {
  CREATE = 'create',
  READ = 'read',
  UPDATE = 'update',
  DELETE = 'delete',
  MANAGE = 'manage', // All actions
  EXECUTE = 'execute',
  APPROVE = 'approve',
  REJECT = 'reject',
  EXPORT = 'export',
  IMPORT = 'import',
}

export enum PermissionResource {
  USER = 'user',
  ROLE = 'role',
  PERMISSION = 'permission',
  WALLET = 'wallet',
  TRANSACTION = 'transaction',
  TOKEN = 'token',
  ADMIN = 'admin',
  REPORT = 'report',
  AUDIT_LOG = 'audit_log',
  SYSTEM = 'system',
  ALL = '*',
}

@Entity('permissions')
@Index(['action', 'resource', 'scope'], { unique: true })
export class Permission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  name: string;

  @Column({ length: 255, nullable: true })
  description: string;

  @Column({ type: 'enum', enum: PermissionAction })
  action: PermissionAction;

  @Column({ type: 'enum', enum: PermissionResource })
  resource: PermissionResource;

  /**
   * Scope allows scoped permissions, e.g.:
   * - null = global
   * - "currency:USD" = scoped to USD currency
   * - "feature:staking" = scoped to staking feature
   * - "tenant:org_123" = scoped to specific tenant
   */
  @Column({ length: 255, nullable: true, default: null })
  scope: string;

  @Column({ type: 'jsonb', nullable: true, default: null })
  conditions: Record<string, any>; // Additional policy conditions

  @Column({ default: true })
  isActive: boolean;

  @ManyToMany(() => Role, (role) => role.permissions)
  roles: Role[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  /**
   * Returns canonical permission string: action:resource[:scope]
   */
  get key(): string {
    return this.scope
      ? `${this.action}:${this.resource}:${this.scope}`
      : `${this.action}:${this.resource}`;
  }
}
