import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum SanctionsListType {
  OFAC = 'ofac', // US Office of Foreign Assets Control
  UN = 'un',     // United Nations
  EU = 'eu',     // European Union
  UK = 'uk',     // United Kingdom
  OTHER = 'other',
}

@Entity('sanctions_lists')
@Index(['listType'])
@Index(['name'])
@Index(['isActive'])
export class SanctionsList {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: SanctionsListType })
  listType: SanctionsListType;

  @Column({ unique: true })
  listId: string; // Unique identifier from the source

  @Column()
  name: string;

  @Column({ nullable: true })
  aka?: string; // Also known as

  @Column({ nullable: true })
  country?: string;

  @Column({ nullable: true })
  dateOfBirth?: string;

  @Column({ nullable: true })
  placeOfBirth?: string;

  @Column({ nullable: true })
  nationality?: string;

  @Column({ nullable: true })
  passportNumber?: string;

  @Column({ nullable: true })
  idNumber?: string;

  @Column({ type: 'text', nullable: true })
  address?: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'json', nullable: true })
  additionalInfo?: Record<string, any>;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'timestamp' })
  listedDate: Date;

  @Column({ type: 'timestamp', nullable: true })
  delistedDate?: Date;

  @Column({ nullable: true })
  sourceUrl?: string;

  @Column({ type: 'timestamp' })
  lastUpdated: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
