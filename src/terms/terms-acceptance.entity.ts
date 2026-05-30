import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('terms_acceptances')
@Index(['userId', 'version'], { unique: true })
export class TermsAcceptance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column()
  version: string;

  @CreateDateColumn()
  acceptedAt: Date;

  @Column({ nullable: true })
  ipAddress: string | null;

  @Column({ nullable: true })
  userAgent: string | null;
}
