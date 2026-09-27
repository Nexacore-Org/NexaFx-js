import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { KycStatus } from '../users/user.entity';

// KycStatus previously redeclared its own enum here (PENDING/VERIFIED/
// REJECTED), duplicating and conflicting with the user entity's
// KycStatus (PENDING/APPROVED/REJECTED). Now imports the shared one.
// This file only ever used the PENDING member below, and a repo-wide
// search (per issue #1304) confirmed nothing outside this file
// references the old VERIFIED value, so no other call site needed
// updating.

@Entity('organisations')
@Index(['ownerId'])
export class Organisation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  name: string;

  @Column({ length: 100, nullable: true })
  registrationNumber: string | null;

  @Column({ length: 100 })
  country: string;

  @Column({ type: 'enum', enum: KycStatus, default: KycStatus.PENDING })
  kycStatus: KycStatus;

  @Column({ type: 'uuid' })
  ownerId: string;

  @CreateDateColumn()
  createdAt: Date;
}