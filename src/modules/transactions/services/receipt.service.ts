import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { TransactionEntity } from '../../transactions/entities/transaction.entity';

export interface ReceiptResult {
  referenceNumber: string;
  transactionId: string;
  amount: number;
  currency: string;
  status: string;
  description?: string;
  createdAt: Date;
  verificationHash: string;
  verificationUrl: string;
  qrCodeData: string;
}

@Injectable()
export class ReceiptService {
  constructor(
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
  ) {}

  async generateReceipt(transactionId: string): Promise<ReceiptResult> {
    const tx = await this.txRepo.findOne({ where: { id: transactionId } });
    if (!tx) throw new NotFoundException('Transaction not found');

    const referenceNumber = `RCP-${tx.id.slice(0, 8).toUpperCase()}`;
    const verificationHash = createHash('sha256')
      .update(`${tx.id}:${tx.amount}:${tx.currency}:${tx.createdAt.toISOString()}`)
      .digest('hex');

    const verificationUrl = `${process.env.APP_URL ?? 'https://api.nexafx.io'}/transactions/${tx.id}/verify?hash=${verificationHash}`;

    return {
      referenceNumber,
      transactionId: tx.id,
      amount: Number(tx.amount),
      currency: tx.currency,
      status: tx.status,
      description: tx.description,
      createdAt: tx.createdAt,
      verificationHash,
      verificationUrl,
      // QR code data — client renders this as a QR code
      qrCodeData: verificationUrl,
    };
  }
}
