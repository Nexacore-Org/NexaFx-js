import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('api_usage_logs')
@Index('idx_api_usage_route', ['route'])
@Index('idx_api_usage_method', ['method'])
@Index('idx_api_usage_user_id', ['userId'])
@Index('idx_api_usage_created_at', ['createdAt'])
@Index('idx_api_usage_route_method', ['route', 'method'])
export class ApiUsageLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  route: string;

  @Column({ type: 'varchar', length: 10 })
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

  @Column({ type: 'uuid', nullable: true })
  userId?: string;

  @Column({ type: 'int' })
  durationMs: number;

  @Column({ type: 'int' })
  statusCode: number;

  @Column({ type: 'text', nullable: true })
  userAgent?: string;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ipAddress?: string;

  @CreateDateColumn()
  createdAt: Date;
}
