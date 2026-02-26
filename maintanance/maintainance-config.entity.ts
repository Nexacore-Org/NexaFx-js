import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('maintenance_config')
export class MaintenanceConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ default: false })
  isMaintenanceMode: boolean;

  @Column({ type: 'text', nullable: true })
  message: string;

  @Column({ type: 'timestamp', nullable: true })
  estimatedEndTime: Date;

  @Column({ type: 'simple-array', nullable: true })
  disabledEndpoints: string[];

  @Column({ type: 'simple-array', nullable: true })
  bypassRoles: string[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}