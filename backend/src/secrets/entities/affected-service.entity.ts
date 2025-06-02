import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToMany,
    Index,
  } from 'typeorm';
  import { Secret } from './secret.entity';
  
  @Entity('affected_services')
  export class AffectedService {
    @PrimaryGeneratedColumn('uuid')
    id: string;
  
    @Column({ unique: true })
    @Index()
    name: string;
  
    @Column()
    endpoint: string;
  
    @Column({ nullable: true })
    description: string;
  
    @Column({ default: true })
    isActive: boolean;
  
    @Column({ nullable: true })
    authMethod: string; // e.g., 'bearer', 'basic', 'api-key'
  
    @Column({ nullable: true })
    authHeader: string; // e.g., 'Authorization', 'X-API-Key'
  
    @Column({ nullable: true, type: 'text' })
    authToken: string; // Encrypted token for authentication
  
    @ManyToMany(() => Secret, secret => secret.affectedServices)
    secrets: Secret[];
  
    @CreateDateColumn()
    createdAt: Date;
  
    @UpdateDateColumn()
    updatedAt: Date;
  }