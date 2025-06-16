import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('device_fingerprints')
@Index(['fingerprint'])
@Index(['ipAddress'])
@Index(['userAgent'])
export class DeviceFingerprint {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  fingerprint: string;

  @Column()
  userAgent: string;

  @Column()
  ipAddress: string;

  @Column({ nullable: true })
  acceptLanguage: string;

  @Column({ nullable: true })
  acceptEncoding: string;

  @Column({ nullable: true })
  connection: string;

  @Column({ type: 'json', nullable: true })
  headers: Record<string, string>;

  @Column({ default: false })
  isSuspicious: boolean;

  @Column({ type: 'text', nullable: true })
  suspiciousReasons: string;

  @Column({ default: 0 })
  requestCount: number;

  @Column({ type: 'timestamp', nullable: true })
  lastSeenAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  firstSeenAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}