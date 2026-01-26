import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('feature_flags')
@Index(['name'], { unique: true })
@Index(['enabled'])
export class FeatureFlagEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', unique: true })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'boolean', default: false })
  enabled: boolean;

  @Column({ type: 'simple-json', nullable: true })
  environments: {
    development?: boolean;
    staging?: boolean;
    production?: boolean;
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
