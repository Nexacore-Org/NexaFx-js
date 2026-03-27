import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type DevicePlatform = 'ios' | 'android';

@Entity('device_tokens')
@Index('idx_device_tokens_user_id', ['userId'])
@Index('idx_device_tokens_token', ['token'], { unique: true })
@Index('idx_device_tokens_user_platform', ['userId', 'platform'])
export class DeviceTokenEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 512, unique: true })
  token: string;

  @Column({ type: 'varchar', length: 10 })
  platform: DevicePlatform;

  @Column({ type: 'varchar', length: 255, nullable: true })
  deviceName?: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
