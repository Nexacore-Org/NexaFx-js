import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Dispute } from './dispute.entity';

@Entity('evidence')
@Index(['disputeId'])
@Index(['uploaderId'])
export class Evidence {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  disputeId: string;

  @ManyToOne(() => Dispute, (dispute) => dispute.evidences)
  @JoinColumn({ name: 'disputeId' })
  dispute: Dispute;

  @Column()
  uploaderId: string;

  @Column()
  s3Key: string;

  @Column()
  filename: string;

  @Column()
  mimeType: string;

  @Column()
  size: number;

  @Column({ type: 'text', nullable: true })
  ocrText: string;

  @Column({ nullable: true })
  ocrConfidence: number;

  @Column({ default: false })
  isProcessed: boolean;

  @Column({ nullable: true })
  extractedData: string; // JSON string for structured data

  @Column({ nullable: true })
  thumbnailKey: string; // S3 key for thumbnail

  @Column({
    type: 'enum',
    enum: ['pending', 'completed', 'failed'],
    default: 'pending',
  })
  uploadStatus: 'pending' | 'completed' | 'failed';

  @Column({ type: 'text', nullable: true })
  uploadError: string; // Error message if upload failed

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
