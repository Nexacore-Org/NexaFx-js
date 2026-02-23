import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type SecretType = 'JWT' | 'WALLET_ENCRYPTION' | 'WEBHOOK';

@Entity('secrets')
@Index('idx_secrets_type_active', ['type', 'isActive'])
@Index('idx_secrets_type_version', ['type', 'version'])
export class SecretEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50 })
  type: SecretType;

  @Column({ type: 'int' })
  version: number;

  /** Encrypted at rest using app-level encryption */
  @Column({ type: 'text' })
  value: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  /** When this version was deactivated — null = still active */
  @Column({ type: 'timestamp', nullable: true })
  retiredAt?: Date;

  @CreateDateColumn()
  createdAt: Date;
}
