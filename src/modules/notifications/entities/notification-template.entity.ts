import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum TemplateChannel {
  EMAIL = 'email',
  SMS = 'sms',
  PUSH = 'push',
  IN_APP = 'in_app',
}

@Entity('notification_templates')
@Index('idx_notif_template_name_channel_locale', ['name', 'channel', 'locale'], { unique: true })
export class NotificationTemplateEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Logical name, e.g. "password_reset", "transaction_completed" */
  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'enum', enum: TemplateChannel })
  channel: TemplateChannel;

  /** BCP-47 locale, e.g. "en", "fr", "es" */
  @Column({ type: 'varchar', length: 10, default: 'en' })
  locale: string;

  /** Handlebars subject template (email only) */
  @Column({ type: 'varchar', length: 500, nullable: true })
  subjectTemplate: string | null;

  /** Handlebars body template */
  @Column({ type: 'text' })
  bodyTemplate: string;

  /** Semver-style version counter, incremented on each PATCH */
  @Column({ type: 'int', default: 1 })
  version: number;

  /** Archived versions are kept for rollback but not used for delivery */
  @Column({ type: 'boolean', default: false })
  isArchived: boolean;

  /** Required variable names that must be present before sending */
  @Column({ type: 'jsonb', default: [] })
  requiredVariables: string[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
