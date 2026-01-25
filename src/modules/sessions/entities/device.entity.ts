import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type DeviceTrustLevel = 'trusted' | 'neutral' | 'risky';

@Entity('devices')
export class DeviceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // user that owns this device
  @Index()
  @Column()
  userId: string;

  // stable device identifier (from client fingerprint)
  @Index()
  @Column({ type: 'varchar', length: 200 })
  deviceKey: string;

  @Column({ type: 'varchar', length: 300, nullable: true })
  deviceName?: string;

  @Column({ type: 'varchar', length: 300, nullable: true })
  userAgent?: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  platform?: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  browser?: string;

  // last known signals
  @Column({ type: 'varchar', length: 60, nullable: true })
  lastIp?: string;

  @Column({ type: 'varchar', length: 2, nullable: true })
  lastCountry?: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  lastCity?: string;

  @Column({ type: 'float', nullable: true })
  lastLat?: number;

  @Column({ type: 'float', nullable: true })
  lastLng?: number;

  // scoring
  @Column({ type: 'int', default: 50 })
  trustScore: number;

  @Column({ type: 'varchar', length: 20, default: 'neutral' })
  trustLevel: DeviceTrustLevel;

  @Column({ type: 'int', default: 0 })
  failedLoginCount: number;

  @Column({ type: 'timestamptz', nullable: true })
  lastLoginAt?: Date;

  // metadata for auditing / overrides
  @Column({ type: 'boolean', default: false })
  manuallyTrusted: boolean;

  @Column({ type: 'boolean', default: false })
  manuallyRisky: boolean;

  @Column({ type: 'jsonb', nullable: true })
  trustSignals?: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
