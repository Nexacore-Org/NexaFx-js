import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('admin_audit_logs')
@Index('idx_admin_audit_admin_id', ['adminId'])
@Index('idx_admin_audit_action', ['action'])
@Index('idx_admin_audit_created_at', ['createdAt'])
export class AdminAuditLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  adminId: string; // The ID of the admin performing the action

  @Column({ type: 'varchar', length: 255 })
  action: string; // e.g., 'CREATE', 'UPDATE', 'DELETE' or specific action name

  @Column({ type: 'varchar', length: 255, nullable: true })
  entity: string; // e.g., 'User', 'Product'

  @Column({ type: 'varchar', length: 255, nullable: true })
  entityId: string; // ID of the entity being affected

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>; // Flexible metadata (e.g., old/new values)

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip: string;

  @CreateDateColumn()
  createdAt: Date;
}
