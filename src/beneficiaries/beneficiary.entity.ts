import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('beneficiaries')
@Index(['userId', 'currency'])
@Index(['userId', 'address'], { unique: true })
export class Beneficiary {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column()
  alias: string;

  @Column()
  address: string;

  @Column()
  currency: string;

  @Column({ nullable: true })
  network: string;

  @Column({ default: false })
  isVerified: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lastUsedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
