import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('deletion_certificates')
export class DeletionCertificate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userHash: string;

  @Column({ type: 'jsonb' })
  anonymizedFields: string[];

  @Column({ type: 'text' })
  signature: string;

  @CreateDateColumn({ update: false })
  timestamp: Date;
}