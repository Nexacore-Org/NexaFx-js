import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DisputeEntity } from './dispute.entity';

@Entity('dispute_messages')
@Index('idx_dispute_messages_dispute_id', ['disputeId'])
@Index('idx_dispute_messages_sender_id', ['senderId'])
export class DisputeMessageEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  disputeId: string;

  @ManyToOne(() => DisputeEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'disputeId' })
  dispute?: DisputeEntity;

  @Column({ type: 'uuid' })
  senderId: string;

  @Column({ type: 'varchar', length: 10 })
  senderRole: 'user' | 'admin';

  @Column({ type: 'text' })
  message: string;

  @CreateDateColumn()
  createdAt: Date;
}
