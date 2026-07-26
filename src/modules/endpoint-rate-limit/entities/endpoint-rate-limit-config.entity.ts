import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

@Entity('endpoint_rate_limit_configs')
export class EndpointRateLimitConfigEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  endpoint: string;

  @Column({ type: 'varchar', length: 10 })
  method: HttpMethod;

  @Column({ type: 'int', default: 100 })
  maxRequests: number;

  @Column({ type: 'int', default: 60000 })
  windowMs: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
