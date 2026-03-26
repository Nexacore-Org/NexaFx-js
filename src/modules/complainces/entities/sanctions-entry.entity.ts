import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('sanctions_entries')
export class SanctionsEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column()
  target: string; // Wallet address or Entity Name

  @Column({ default: 'MANUAL_BLOCK' })
  reason: string;

  @Column({ default: 'GLOBAL' })
  jurisdiction: string;

  @CreateDateColumn()
  createdAt: Date;
}