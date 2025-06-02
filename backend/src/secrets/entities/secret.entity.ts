import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToMany,
    JoinTable,
    Index,
  } from 'typeorm';
  import { AffectedService } from './affected-service.entity';
  import { SecretType } from '../dto/secrets.dto';
  
  @Entity('secrets')
  export class Secret {
    @PrimaryGeneratedColumn('uuid')
    id: string;
  
    @Column({ unique: true })
    @Index()
    name: string;
  
    @Column({ type: 'text' })
    value: string; // Encrypted value
  
    @Column({
      type: 'enum',
      enum: SecretType,
    })
    type: SecretType;
  
    @Column({ nullable: true })
    description: string;
  
    @Column({ default: true })
    isActive: boolean;
  
    @Column({ nullable: true, type: 'timestamp' })
    expiresAt: Date;
  
    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    lastRotatedAt: Date;
  
    @Column({ default: 0 })
    rotationCount: number;
  
    @ManyToMany(() => AffectedService, service => service.secrets, { 
      cascade: true,
      eager: false 
    })
    @JoinTable({
      name: 'secret_affected_services',
      joinColumn: { name: 'secret_id', referencedColumnName: 'id' },
      inverseJoinColumn: { name: 'service_id', referencedColumnName: 'id' },
    })
    affectedServices: AffectedService[];
  
    @CreateDateColumn()
    createdAt: Date;
  
    @UpdateDateColumn()
    updatedAt: Date;
  }