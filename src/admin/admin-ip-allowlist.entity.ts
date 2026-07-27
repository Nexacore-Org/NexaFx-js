import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('admin_ip_allowlists')
export class AdminIpAllowlist {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  adminUserId: string;

  @Column()
  ipCidr: string;

  @Column({ nullable: true })
  label?: string;

  @CreateDateColumn()
  addedAt: Date;
}
