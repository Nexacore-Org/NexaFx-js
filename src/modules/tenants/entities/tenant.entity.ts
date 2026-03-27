import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  slug: string; // Used for subdomains or header lookup

  @Column()
  name: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'jsonb', default: {} })
  whiteLabelConfig: {
    logoUrl?: string;
    primaryColor?: string;
    supportEmail?: string;
  };

  @Column({ type: 'jsonb', default: {} })
  featureFlags: Record<string, boolean>;

  @Column({ default: 1000 }) // Default RPM
  rateLimit: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}