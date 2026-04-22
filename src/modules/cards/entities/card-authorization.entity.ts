import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export enum AuthorizationStatus {
  APPROVED = 'APPROVED',
  DECLINED = 'DECLINED',
  CHALLENGE_REQUIRED = 'CHALLENGE_REQUIRED',
}

export enum DeclineReason {
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  FROZEN_CARD = 'FROZEN_CARD',
  LIMIT_EXCEEDED = 'LIMIT_EXCEEDED',
  SUSPECTED_FRAUD = 'SUSPECTED_FRAUD',
}

@Entity('card_authorizations')
@Index(['cardId'])
export class CardAuthorization {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  cardId: string;

  @Column('decimal', { precision: 15, scale: 2 })
  amount: number;

  @Column({ length: 10 })
  currency: string;

  @Column({ nullable: true })
  merchantName: string;

  @Column({ type: 'enum', enum: AuthorizationStatus })
  status: AuthorizationStatus;

  @Column({ type: 'enum', enum: DeclineReason, nullable: true })
  declineReason: DeclineReason | null;

  @Column({ nullable: true })
  threeDsRedirectUrl: string | null;

  @Column({ nullable: true })
  networkRequestId: string;

  @CreateDateColumn()
  createdAt: Date;
}
