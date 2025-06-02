import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export enum AuditActionType {
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  USER_CREATE = 'USER_CREATE',
  USER_UPDATE = 'USER_UPDATE',
  USER_DELETE = 'USER_DELETE',
  PASSWORD_CHANGE = 'PASSWORD_CHANGE',
  ROLE_CHANGE = 'ROLE_CHANGE',
  DATA_EXPORT = 'DATA_EXPORT',
  SETTINGS_UPDATE = 'SETTINGS_UPDATE',
}

@Entity('audit_logs')
@Index(['userId'])
@Index(['actionType'])
@Index(['timestamp'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: AuditActionType,
  })
  actionType: AuditActionType;

  @Column('uuid')
  userId: string;

  @Column({ nullable: true })
  userEmail?: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, any>;

  @Column({ nullable: true })
  ipAddress?: string;

  @Column({ nullable: true })
  userAgent?: string;

  @CreateDateColumn()
  timestamp: Date;

  @Column({ nullable: true })
  resourceId?: string;

  @Column({ nullable: true })
  resourceType?: string;
}