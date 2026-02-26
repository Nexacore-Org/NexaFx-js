import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum ActorType {
  ADMIN = 'admin',
  USER = 'user',
  SYSTEM = 'system',
  API = 'api',
}

@Entity('admin_audit_logs')
@Index('idx_admin_audit_actor_id', ['actorId'])
@Index('idx_admin_audit_actor_type', ['actorType'])
@Index('idx_admin_audit_action', ['action'])
@Index('idx_admin_audit_entity', ['entity'])
@Index('idx_admin_audit_created_at', ['createdAt'])
export class AdminAuditLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  actorId: string; // The ID of the actor (user/admin/system) performing the action

  @Column({
    type: 'enum',
    enum: ActorType,
    default: ActorType.USER,
  })
  actorType: ActorType;

  @Column({ type: 'varchar', length: 255 })
  action: string; // e.g., 'CREATE', 'UPDATE', 'DELETE' or specific action name

  @Column({ type: 'varchar', length: 255, nullable: true })
  entity: string; // e.g., 'User', 'Transaction', 'Wallet'

  @Column({ type: 'varchar', length: 255, nullable: true })
  entityId: string; // ID of the entity being affected

  @Column({ type: 'jsonb', nullable: true })
  beforeSnapshot: Record<string, any>; // Entity state before the action

  @Column({ type: 'jsonb', nullable: true })
  afterSnapshot: Record<string, any>; // Entity state after the action

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>; // Additional context (request info, changes summary)

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  userAgent: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string; // Human-readable description of the action

  @CreateDateColumn()
  createdAt: Date;
}
