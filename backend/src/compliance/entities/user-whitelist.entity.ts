import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';

export enum WhitelistStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  REVOKED = 'revoked',
}

@Entity('user_whitelists')
@Index(['userId', 'recipientId'])
@Index(['status'])
export class UserWhitelist {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @Column('uuid')
  recipientId: string;

  @Column()
  recipientName: string;

  @Column({ nullable: true })
  recipientAccount?: string;

  @Column({ nullable: true })
  recipientBank?: string;

  @Column({ nullable: true })
  relationship?: string;

  @Column({ type: 'enum', enum: WhitelistStatus, default: WhitelistStatus.PENDING })
  status: WhitelistStatus;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ nullable: true })
  approvedBy?: string;

  @Column({ type: 'timestamp', nullable: true })
  approvedAt?: Date;

  @Column({ nullable: true })
  revokedBy?: string;

  @Column({ type: 'timestamp', nullable: true })
  revokedAt?: Date;

  @Column({ nullable: true })
  revocationReason?: string;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  limitIncrease?: number; // Percentage increase allowed for whitelisted recipients

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
