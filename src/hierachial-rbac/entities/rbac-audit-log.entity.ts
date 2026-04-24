import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('rbac_audit_logs')
@Index('idx_rbac_audit_actor', ['actorId'])
@Index('idx_rbac_audit_created', ['createdAt'])
export class RbacAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50 })
  action: string; // ROLE_CREATED, ROLE_UPDATED, ROLE_DELETED, PERMISSION_ASSIGNED, etc.

  @Column({ type: 'uuid' })
  actorId: string;

  @Column({ type: 'uuid', nullable: true })
  targetRoleId: string;

  @Column({ type: 'uuid', nullable: true })
  targetUserId: string;

  @Column({ type: 'jsonb', nullable: true })
  oldState: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  newState: Record<string, any>;

  @Column({ type: 'varchar', nullable: true })
  reason: string;

  @CreateDateColumn()
  createdAt: Date;
}
