import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('admin_messages')
export class AdminMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  adminId: string;

  @Column({ default: 'ALL' })
  targetType: 'ALL' | 'SEGMENT' | 'USER';

  @Column({ nullable: true })
  targetUserId?: string;

  @Column({ nullable: true })
  targetSegment?: string;

  @Column()
  title: string;

  @Column('text')
  body: string;

  @Column({ default: 'NORMAL' })
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

  @Column({ nullable: true })
  scheduledAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ nullable: true })
  sentAt?: Date;
}
