import { Entity, Column, PrimaryColumn, CreateDateColumn, Index } from 'typeorm';

@Entity('idempotency_keys')
@Index(['createdAt'])
@Index(['expiresAt'])
export class IdempotencyKey {
  @PrimaryColumn()
  key: string;

  @Column('text')
  requestHash: string;

  @Column('jsonb')
  response: any;

  @Column('int')
  statusCode: number;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date;
}
