import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('api_keys')
@Index('idx_api_keys_prefix', ['prefix'])
@Index('idx_api_keys_hashed', ['hashedKey'], { unique: true })
export class ApiKeyEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 8, unique: true })
  prefix: string; // First 8 chars in plain text for lookup

  @Column({ type: 'varchar', length: 64, unique: true })
  hashedKey: string; // SHA-256 hash of full key

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'simple-array' })
  scopes: string[]; // e.g., ['webhook:read', 'admin:write']

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  lastUsedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
