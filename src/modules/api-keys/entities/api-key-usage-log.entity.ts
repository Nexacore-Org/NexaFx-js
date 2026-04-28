import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('api_key_usage_logs')
@Index('idx_api_key_usage_api_key', ['apiKeyId'])
@Index('idx_api_key_usage_timestamp', ['timestamp'])
export class ApiKeyUsageLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  apiKeyId: string;

  @Column({ type: 'varchar', length: 255 })
  endpoint: string;

  @Column({ type: 'int' })
  responseStatus: number;

  @Column({ type: 'int' })
  latencyMs: number;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ipAddress: string;

  @CreateDateColumn()
  timestamp: Date;
}
