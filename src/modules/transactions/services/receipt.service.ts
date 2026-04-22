import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
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

    const appUrl = process.env.APP_URL ?? 'https://api.nexafx.io';
    const verificationUrl = `${appUrl}/transactions/${tx.id}/verify?hash=${verificationHash}`;

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
      qrCodeData: verificationUrl,
    };
  }

  async generateReceiptPdf(transactionId: string): Promise<{ pdf: Buffer; checksum: string }> {
    const receipt = await this.generateReceipt(transactionId);

    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
    const page = doc.addPage([420, 595]); // A5
    const { width, height } = page.getSize();
    let y = height - 50;

    const draw = (text: string, x: number, size = 10, bold = false) => {
      page.drawText(text, { x, y, size, font: bold ? boldFont : font, color: rgb(0, 0, 0) });
    };

    // Header
    draw('NexaFx Transaction Receipt', 50, 14, true);
    y -= 30;

    // Reference
    draw(`Reference: ${receipt.referenceNumber}`, 50, 10, true);
    y -= 20;

    // Details
    const rows: [string, string][] = [
      ['Transaction ID', receipt.transactionId],
      ['Amount', `${receipt.amount.toFixed(2)} ${receipt.currency}`],
      ['Status', receipt.status],
      ['Date', receipt.createdAt.toISOString().replace('T', ' ').slice(0, 19) + ' UTC'],
    ];

    if (receipt.description) {
      rows.push(['Description', receipt.description.slice(0, 40)]);
    }

    for (const [label, value] of rows) {
      draw(`${label}:`, 50, 9, true);
      draw(value, 160, 9);
      y -= 16;
    }

    y -= 10;
    page.drawLine({ start: { x: 50, y }, end: { x: width - 50, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
    y -= 20;

    // QR code placeholder (text representation — real QR requires qrcode library)
    draw('Verification QR Code:', 50, 9, true);
    y -= 14;
    draw('Scan to verify this receipt:', 50, 8);
    y -= 12;
    // Draw a simple placeholder box for QR
    page.drawRectangle({ x: 50, y: y - 60, width: 60, height: 60, borderColor: rgb(0, 0, 0), borderWidth: 1 });
    draw('[QR]', 68, 8);
    y -= 70;

    // Verification URL (truncated)
    draw('Verify at:', 50, 8, true);
    y -= 12;
    const urlDisplay = receipt.verificationUrl.slice(0, 55);
    draw(urlDisplay, 50, 7);
    y -= 20;

    // Checksum footer
    page.drawLine({ start: { x: 50, y }, end: { x: width - 50, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
    y -= 12;
    draw(`SHA-256: ${receipt.verificationHash.slice(0, 32)}...`, 50, 6);

    const pdfBytes = await doc.save();
    const checksum = createHash('sha256').update(pdfBytes).digest('hex');
    return { pdf: Buffer.from(pdfBytes), checksum };
  }
}
