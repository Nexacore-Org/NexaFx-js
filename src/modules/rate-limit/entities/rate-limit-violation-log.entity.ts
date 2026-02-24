import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('rate_limit_violation_logs')
@Index(['userId'])
@Index(['ipAddress'])
@Index(['route'])
@Index(['createdAt'])
export class RateLimitViolationLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', nullable: true })
  userId?: string;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ipAddress?: string;

  @Column({ type: 'varchar', length: 255 })
  route: string;

  @Column({ type: 'varchar', length: 10 })
  method: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  tier?: string;

  @Column({ type: 'int', nullable: true })
  limit?: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  userAgent?: string;

  @CreateDateColumn()
  createdAt: Date;
}
