import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('user_deactivations')
@Index('idx_user_deactivations_user_id', ['userId'])
export class UserDeactivationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'text', nullable: true })
  reason?: string;

  @Column({ type: 'uuid', nullable: true })
  deactivatedBy?: string;

  @Column({ type: 'uuid', nullable: true })
  reactivatedBy?: string;

  @Column({ type: 'timestamp' })
  deactivatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  reactivatedAt?: Date;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
