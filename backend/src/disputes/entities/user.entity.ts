import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
// Forward declaration to avoid circular imports
export interface Dispute {
  id: string;
  userId: string;
  assignedToId?: string;
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  name: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ default: 1 })
  tier: number; // 1..3

  @Column({ default: false })
  isAgent: boolean;

  @Column({ nullable: true })
  agentLevel: string; // L1, L2, L3

  @Column({ nullable: true })
  maxConcurrentDisputes: number;

  @Column({ nullable: true })
  fcmToken: string;

  @Column({ type: 'text', nullable: true })
  notificationPreferences: string; // JSON string

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany('Dispute', 'user')
  disputes: Dispute[];

  @OneToMany('Dispute', 'assignedTo')
  assignedDisputes: Dispute[];
}
