import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('api_key_usage_logs')
@Index(['apiKeyId'])
@Index(['createdAt'])
export class ApiKeyUsageLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  apiKeyId: string;

  @Column({ length: 255 })
  endpoint: string;

  @Column({ length: 10 })
  method: string;

  @Column({ nullable: true })
  responseStatus: number;

  @Column({ nullable: true })
  latencyMs: number;

  @Column({ length: 45, nullable: true })
  ipAddress: string;

  @CreateDateColumn()
  createdAt: Date;
}
