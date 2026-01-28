import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('rpc_health_logs')
@Index('idx_rpc_health_network', ['network'])
@Index('idx_rpc_health_status', ['status'])
@Index('idx_rpc_health_created_at', ['createdAt'])
export class RpcHealthLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50 })
  network: string;

  @Column({ type: 'varchar', length: 255 })
  providerUrl: string;

  @Column({ type: 'int' })
  latencyMs: number;

  @Column({ type: 'varchar', length: 20 })
  status: 'up' | 'down' | 'degraded';

  @CreateDateColumn()
  createdAt: Date;
}
