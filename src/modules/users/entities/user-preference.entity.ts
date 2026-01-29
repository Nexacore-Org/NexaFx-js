import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type UserTheme = 'light' | 'dark' | 'system';

@Entity('user_preferences')
@Index('idx_user_prefs_user_id', ['userId'], { unique: true })
export class UserPreferenceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  userId: string;

  @Column({
    type: 'varchar',
    length: 10,
    default: 'system',
  })
  theme: UserTheme;

  // Future proofing for other preferences
  @Column({ type: 'jsonb', nullable: true })
  settings: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
