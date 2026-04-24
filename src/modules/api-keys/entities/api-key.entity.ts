import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum ApiKeyScope {
  WEBHOOK = 'webhook',
  READ = 'read',
  WRITE = 'write',
  ADMIN = 'admin',
}

export enum ApiKeyStatus {
  ACTIVE = 'active',
  REVOKED = 'revoked',
  EXPIRED = 'expired',
}

@Entity('api_keys')
@Index(['prefix'])
@Index(['status'])
export class ApiKey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  name: string;

  /** First 8 chars of the raw key — stored in plain text for lookup */
  @Column({ length: 8 })
  prefix: string;

  /** SHA-256 hash of the full key */
  @Column({ length: 64 })
  hashedKey: string;

  @Column({ type: 'simple-array' })
  scopes: ApiKeyScope[];

  @Column({ type: 'enum', enum: ApiKeyStatus, default: ApiKeyStatus.ACTIVE })
  status: ApiKeyStatus;

  @Column({ nullable: true })
  expiresAt: Date;

  @Column({ nullable: true })
  lastUsedAt: Date;

  /** For rotation: old key stays valid for 5 minutes after rotation */
  @Column({ nullable: true })
  rotatedAt: Date;

  @Column({ nullable: true })
  rotatedToId: string;

  @Column({ nullable: true })
  createdBy: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
