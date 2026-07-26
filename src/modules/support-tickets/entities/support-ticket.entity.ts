import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type TicketStatus = 'open' | 'in_progress' | 'waiting_customer' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';

@Entity('support_tickets')
@Index('idx_support_tickets_user_id', ['userId'])
@Index('idx_support_tickets_status', ['status'])
@Index('idx_support_tickets_assigned_to', ['assignedTo'])
@Index('idx_support_tickets_created_at', ['createdAt'])
export class SupportTicketEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 255 })
  subject: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'varchar', length: 30, default: 'open' })
  status: TicketStatus;

  @Column({ type: 'varchar', length: 20, default: 'medium' })
  priority: TicketPriority;

  @Column({ type: 'uuid', nullable: true })
  assignedTo?: string;

  @Column({ type: 'timestamp', nullable: true })
  resolvedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
