import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum SupportTicketCategory {
  TRANSACTION = 'transaction',
  KYC = 'kyc',
  ACCOUNT = 'account',
  OTHER = 'other',
}

export enum SupportTicketStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in-progress',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
}

@Entity('support_tickets')
export class SupportTicket {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  userId: string;

  @Column()
  subject: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'enum', enum: SupportTicketCategory })
  category: SupportTicketCategory;

  @Column({
    type: 'enum',
    enum: SupportTicketStatus,
    default: SupportTicketStatus.OPEN,
  })
  status: SupportTicketStatus;

  @Column({ nullable: true })
  relatedEntityType?: string | null;

  @Column({ nullable: true })
  relatedEntityId?: string | null;

  @Column({ nullable: true })
  updatedBy?: string | null;

  @Column({ type: 'timestamp', nullable: true })
  resolvedAt?: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
