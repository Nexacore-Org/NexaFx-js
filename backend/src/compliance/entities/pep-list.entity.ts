import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum PEPCategory {
  HEAD_OF_STATE = 'head_of_state',
  GOVERNMENT_MINISTER = 'government_minister',
  SENIOR_OFFICIAL = 'senior_official',
  JUDICIAL_OFFICIAL = 'judicial_official',
  MILITARY_OFFICIAL = 'military_official',
  STATE_OWNED_ENTERPRISE = 'state_owned_enterprise',
  INTERNATIONAL_ORGANIZATION = 'international_organization',
  FAMILY_MEMBER = 'family_member',
  CLOSE_ASSOCIATE = 'close_associate',
}

@Entity('pep_lists')
@Index(['name'])
@Index(['country'])
@Index(['category'])
@Index(['isActive'])
export class PEPList {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  title?: string;

  @Column({ nullable: true })
  country?: string;

  @Column({ type: 'enum', enum: PEPCategory })
  category: PEPCategory;

  @Column({ nullable: true })
  position?: string;

  @Column({ nullable: true })
  organization?: string;

  @Column({ nullable: true })
  dateOfBirth?: string;

  @Column({ nullable: true })
  placeOfBirth?: string;

  @Column({ nullable: true })
  nationality?: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'json', nullable: true })
  additionalInfo?: Record<string, any>;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'timestamp', nullable: true })
  startDate?: Date;

  @Column({ type: 'timestamp', nullable: true })
  endDate?: Date;

  @Column({ nullable: true })
  sourceUrl?: string;

  @Column({ type: 'timestamp' })
  lastUpdated: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
