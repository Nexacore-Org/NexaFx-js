import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, Unique } from 'typeorm';

export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
  CANCELLED = 'CANCELLED'
}

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

@Entity('invoices')
@Unique(['userId', 'invoiceNumber'])
export class Invoice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  userId: string;

  @Column()
  invoiceNumber: string; // e.g., "INV-00001" (scoped per user)

  @Column()
  recipientEmail: string;

  @Column()
  recipientName: string;

  @Column('jsonb')
  lineItems: InvoiceLineItem[];

  @Column('decimal', { precision: 18, scale: 4 })
  subtotal: number;

  @Column('decimal', { precision: 18, scale: 4 })
  taxAmount: number;

  @Column('decimal', { precision: 18, scale: 4 })
  totalAmount: number;

  @Column()
  currency: string;

  @Column('decimal', { precision: 5, scale: 2, default: 0 })
  taxPercent: number;

  @Column({ nullable: true })
  notes: string;

  @Column({ type: 'timestamptz' })
  dueDate: Date;

  @Column({ type: 'enum', enum: InvoiceStatus, default: InvoiceStatus.DRAFT })
  status: InvoiceStatus;

  @Column({ nullable: true })
  paymentUrl: string;

  @Column({ type: 'timestamptz', nullable: true })
  paidAt: Date;

  @Column({ nullable: true })
  linkedTransactionId: string;

  @Column({ default: 0 })
  reminderCount: number;

  @Column({ type: 'timestamptz', nullable: true })
  lastReminderSentAt: Date;

  @Column({ nullable: true })
  pdfS3Key: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}