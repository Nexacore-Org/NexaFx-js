import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum RbacAuditAction {
  ROLE_CREATED = 'ROLE_CREATED',
  ROLE_UPDATED = 'ROLE_UPDATED',
  ROLE_DELETED = 'ROLE_DELETED',
  PERMISSION_CREATED = 'PERMISSION_CREATED',
  PERMISSION_UPDATED = 'PERMISSION_UPDATED',
  PERMISSION_DELETED = 'PERMISSION_DELETED',
  ROLE_PERMISSION_ASSIGNED = 'ROLE_PERMISSION_ASSIGNED',
  ROLE_PERMISSION_REVOKED = 'ROLE_PERMISSION_REVOKED',
  USER_ROLE_ASSIGNED = 'USER_ROLE_ASSIGNED',
  USER_ROLE_REVOKED = 'USER_ROLE_REVOKED',
  ACCESS_GRANTED = 'ACCESS_GRANTED',
  ACCESS_DENIED = 'ACCESS_DENIED',
}

@Entity('rbac_audit_logs')
@Index(['actorId'])
@Index(['targetUserId'])
@Index(['action'])
@Index(['createdAt'])
export class RbacAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: RbacAuditAction })
  action: RbacAuditAction;

  @Column({ nullable: true })
  actorId: string;

  @Column({ nullable: true })
  targetUserId: string;

  @Column({ nullable: true })
  targetRoleId: string;

  @Column({ nullable: true })
  targetPermissionId: string;

  @Column({ type: 'jsonb', nullable: true })
  previousState: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  newState: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @Column({ length: 45, nullable: true })
  ipAddress: string;

  @Column({ type: 'text', nullable: true })
  userAgent: string;

  @CreateDateColumn()
  createdAt: Date;
}
