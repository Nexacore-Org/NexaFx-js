import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

export enum GoalStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}

@Entity('goals')
export class Goal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  targetAmount: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  currentAmount: number;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency: string;

  @Column({ type: 'timestamp', nullable: true })
  deadline: Date;

  @Column({
    type: 'enum',
    enum: GoalStatus,
    default: GoalStatus.ACTIVE,
  })
  status: GoalStatus;

  @Column({ type: 'uuid', nullable: true })
  linkedWalletId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Virtual field for progress percentage
  get progressPercentage(): number {
    if (this.targetAmount <= 0) return 0;
    const progress = (Number(this.currentAmount) / Number(this.targetAmount)) * 100;
    return Math.min(progress, 100);
  }

  // Virtual field to check if goal is overdue
  get isOverdue(): boolean {
    if (!this.deadline) return false;
    return new Date() > new Date(this.deadline) && this.status === GoalStatus.ACTIVE;
  }
}