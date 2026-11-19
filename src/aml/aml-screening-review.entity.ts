import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AmlDisposition } from './aml-screening.entity';

/** Immutable record of each review decision, so later reviewers cannot erase history. */
@Entity('aml_screening_reviews')
@Index(['screeningId', 'createdAt'])
export class AmlScreeningReview {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  screeningId!: string;

  @Column({ type: 'uuid' })
  reviewedBy!: string;

  @Column({ type: 'simple-enum', enum: AmlDisposition })
  disposition!: AmlDisposition;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
