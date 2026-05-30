import {
  CreateDateColumn,
  Column,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

@Entity('refresh_tokens')
@Index(['userId'])
@Index(['familyId'])
@Index(['expiresAt'])
@Index(['tokenHash'], { unique: true })
export class RefreshToken {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'text' })
  userId: string;

  @Column({ type: 'uuid' })
  familyId: string;

  @Column({ type: 'text' })
  tokenHash: string;

  @Column({ type: 'uuid', nullable: true })
  parentTokenId: string | null;

  @Column({ type: 'uuid', nullable: true })
  replacedByTokenId: string | null;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastUsedAt: Date | null;
}
