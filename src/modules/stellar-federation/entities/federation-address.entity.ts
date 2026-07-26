import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('federation_addresses')
@Index('idx_federation_addresses_domain', ['domain'])
@Index('idx_federation_addresses_stellar_address', ['stellarAddress'])
@Index('idx_federation_addresses_is_active', ['isActive'])
export class FederationAddressEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 255 })
  domain: string;

  @Column({ type: 'varchar', length: 255 })
  stellarAddress: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  memo?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  memoType?: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
