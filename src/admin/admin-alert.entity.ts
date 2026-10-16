import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Durable record of every admin alert, whether it was delivered or suppressed. */
@Entity('admin_alerts')
@Index('idx_admin_alerts_created_at', ['createdAt'])
@Index('idx_admin_alerts_type_subject', ['type', 'subject'])
export class AdminAlertEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  type!: string;

  /** userId / transactionId / alertId the alert is about, or 'global'. */
  @Column({ type: 'varchar', length: 100, default: 'global' })
  subject!: string;

  @Column({ type: 'varchar', length: 20 })
  severity!: string;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text' })
  message!: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown> | null;

  /** True when rate limiting kept this alert from being sent (it is counted in a digest instead). */
  @Column({ type: 'boolean', default: false })
  suppressed!: boolean;

  @Column({ type: 'boolean', default: false })
  read!: boolean;

  @CreateDateColumn()
  createdAt!: Date;
}
