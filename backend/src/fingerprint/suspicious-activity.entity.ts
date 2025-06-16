@Entity('suspicious_activities')
export class SuspiciousActivity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  fingerprint: string;

  @Column()
  activityType: string;

  @Column({ type: 'text' })
  description: string;

  @Column()
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

  @Column({ type: 'json' })
  metadata: Record<string, any>;

  @CreateDateColumn()
  detectedAt: Date;
}
