import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum CardStatus {
  ACTIVE = 'ACTIVE',
  FROZEN = 'FROZEN',
  CANCELLED = 'CANCELLED',
}

@Entity('virtual_cards')
export class VirtualCard {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  walletId: string;

  @Column()
  userId: string;

  @Column({ select: false }) // Encrypted full PAN
  encryptedPan: string;

  @Column()
  maskedPan: string; // e.g., **** **** **** 1234

  @Column({ select: false }) // Hashed CVV
  hashedCvv: string;

  @Column()
  expiryDate: string; // MM/YY

  @Column({ type: 'enum', enum: CardStatus, default: CardStatus.ACTIVE })
  status: CardStatus;

  @Column('decimal', { precision: 15, scale: 2 })
  perTransactionLimit: number;

  @Column('decimal', { precision: 15, scale: 2 })
  monthlySpendLimit: number;

  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  currentMonthSpend: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}