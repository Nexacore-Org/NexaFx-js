import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export interface TargetingRule {
  type: 'role' | 'country' | 'userId' | 'percentage';
  value: string | number;
}

@Entity('feature_flags')
@Index(['name'], { unique: true })
@Index(['enabled'])
export class FeatureFlagEntity {
  @ApiProperty({ description: 'Feature flag UUID' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: 'Unique flag name', example: 'new-dashboard' })
  @Column({ type: 'varchar', unique: true })
  name: string;

  @ApiPropertyOptional({ description: 'Human-readable description' })
  @Column({ type: 'text', nullable: true })
  description: string;

  @ApiProperty({ description: 'Global enabled state', example: false })
  @Column({ type: 'boolean', default: false })
  enabled: boolean;

  @ApiPropertyOptional({ description: 'Per-environment enabled overrides' })
  @Column({ type: 'simple-json', nullable: true })
  environments: {
    development?: boolean;
    staging?: boolean;
    production?: boolean;
  };

  @ApiPropertyOptional({
    description: 'Targeting rules: role, country, userId, or percentage rollout',
    example: [{ type: 'percentage', value: 25 }, { type: 'country', value: 'NG' }],
  })
  @Column({ type: 'jsonb', nullable: true })
  targetingRules: TargetingRule[] | null;

  @ApiProperty()
  @CreateDateColumn()
  createdAt: Date;

  @ApiProperty()
  @UpdateDateColumn()
  updatedAt: Date;
}
