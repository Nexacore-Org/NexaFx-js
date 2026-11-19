import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { Repository } from 'typeorm';
import { StatementView } from '../statements/statements.types';
import { Transaction } from '../transactions/transaction.entity';
import { User } from '../users/user.entity';

interface ReceiptRecord {
  id: string;
  date: string;
  description: string;
  amount: number;
  status: string;
}

const CURRENCY_DECIMALS: Record<string, number> = {
  USD: 2,
  EUR: 2,
  GBP: 2,
  NGN: 2,
};

const UNSAFE_SYMBOL_MAP: Record<string, string> = {
  '₦': 'NGN',
  '€': 'EUR',
  '£': 'GBP',
  $: 'USD',
  '¥': 'JPY',
  '₹': 'INR',
  '₩': 'KRW',
  '₽': 'RUB',
  '₺': 'TRY',
  '—': '-',
  '–': '-',
  '→': '->',
  '←': '<-',
};

@Injectable()
export class PdfService {
  constructor(
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
  ) {}

  async generateStatementPdf(statement: StatementView): Promise<Uint8Array> {
    const heading = `Statement for ${statement.user.firstName} ${statement.user.lastName}`;
    const metadata = [
      `Account: ${statement.user.email}`,
      `Period: ${statement.period.from.substring(0, 10)} - ${statement.period.to.substring(0, 10)}`,
      `Opening balance: ${this.formatCurrency(statement.openingBalance, statement.currency)}`,
      `Closing balance: ${this.formatCurrency(statement.closingBalance, statement.currency)}`,
      `Generated: ${statement.generatedAt}`,
    ];

    return this.buildPdf(
      heading,
      statement.user.email,
      metadata,
      statement.lines.map((line) => ({
        id: line.reference,
        date: line.date.substring(0, 10),
        description: `${line.description} (${line.source})`,
        amount: line.amount,
        status: line.amount >= 0 ? 'Credit' : 'Debit',
      })),
      statement.currency,
    );
  }

  async generateReceiptPdf(
    transaction: Transaction | string,
  ): Promise<Uint8Array> {
    const tx =
      typeof transaction === 'string'
        ? await this.txRepo.findOne({ where: { id: transaction } })
        : transaction;
    if (!tx) {
      throw new NotFoundException('Transaction not found');
    }

    const meta = tx.metadata ?? {};
    const isSwap = meta['type'] === 'swap';
    const currency = tx.currency ?? 'EUR';
    const date = tx.completedAt ?? tx.createdAt ?? new Date();
    const receiptNumber = tx.receiptNumber ?? tx.reference ?? tx.id;
    const senderName = this.displayName(tx.sender, tx.senderId);
    const receiverName = this.displayName(tx.receiver, tx.receiverId);
    const amount = Number(tx.amount ?? 0);
    const fee = Number(tx.fee ?? 0);
    const status = String(tx.status ?? 'unknown');

    const metadata = [
      `Receipt no: ${receiptNumber}`,
      `Reference: ${tx.reference ?? tx.id}`,
      `Date (UTC): ${date.toISOString()}`,
      `Status: ${status}`,
      `Sender: ${senderName}`,
      `Receiver: ${receiverName}`,
      `Amount: ${this.formatCurrency(amount, currency)}`,
      `Fee: ${this.formatCurrency(fee, currency)}`,
    ];

    const convertedAmount = this.metaText(meta['toAmount']);
    const convertedCurrency = this.metaText(meta['toCurrency']);
    const fxRate = this.metaText(meta['rate']);

    if (isSwap) {
      metadata.push(
        `Converted: ${convertedAmount} ${convertedCurrency}`.trim(),
        `FX rate: ${fxRate}`,
      );
    }
    if (status === 'failed') {
      metadata.push(
        `Reason: ${this.metaText(meta['failureReason']) || 'Transaction failed'}`,
      );
    }

    const description = isSwap
      ? `FX swap ${convertedAmount} ${convertedCurrency} @ ${fxRate}`
      : `Transfer ${tx.reference ?? tx.id}`;

    return this.buildPdf(
      `Receipt ${receiptNumber}`,
      `${senderName} -> ${receiverName}`,
      metadata,
      [
        {
          id: receiptNumber,
          date: date.toISOString().substring(0, 10),
          description,
          amount,
          status,
        },
      ],
      currency,
    );
  }

  private displayName(user: User | undefined, fallback: string): string {
    if (!user) return fallback ?? 'Unknown';
    return (
      `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() ||
      user.email ||
      fallback
    );
  }

  private metaText(value: unknown): string {
    return typeof value === 'string' || typeof value === 'number'
      ? String(value)
      : '';
  }

  private sanitize(value: string): string {
    return [...String(value ?? '')]
      .flatMap((char) => (UNSAFE_SYMBOL_MAP[char] ?? char).split(''))
      .map((char) => {
        const codePoint = char.codePointAt(0) ?? 0;
        const isWinAnsi =
          (codePoint >= 0x20 && codePoint <= 0x7e) ||
          (codePoint >= 0xa1 && codePoint <= 0xff);
        return isWinAnsi ? char : '';
      })
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private async buildPdf(
    heading: string,
    userName: string,
    metadata: string[],
    transactions: ReceiptRecord[],
    currency = 'EUR',
  ): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    const helvetica = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([612, 792]);
    const { height } = page.getSize();
    const margin = 50;
    const lineHeight = 16;
    const draw = (text: string, options: Parameters<typeof page.drawText>[1]) =>
      page.drawText(this.sanitize(text), options);

    draw('NexaFx', {
      x: margin,
      y: height - margin,
      size: 24,
      font: helvetica,
      color: rgb(0.1, 0.3, 0.7),
    });

    draw(heading, {
      x: margin,
      y: height - margin - 36,
      size: 14,
      font: helvetica,
      color: rgb(0, 0, 0),
    });

    draw(`Account: ${userName}`, {
      x: margin,
      y: height - margin - 60,
      size: 10,
      font: helvetica,
      color: rgb(0.2, 0.2, 0.2),
    });

    metadata.forEach((text, index) => {
      draw(text, {
        x: margin,
        y: height - margin - 80 - index * lineHeight,
        size: 10,
        font: helvetica,
        color: rgb(0.2, 0.2, 0.2),
      });
    });

    const tableTop =
      height - margin - Math.max(140, 80 + metadata.length * lineHeight + 24);
    draw('Date', {
      x: margin,
      y: tableTop,
      size: 10,
      font: helvetica,
      color: rgb(0, 0, 0),
    });
    draw('Description', {
      x: 140,
      y: tableTop,
      size: 10,
      font: helvetica,
      color: rgb(0, 0, 0),
    });
    draw('Amount', {
      x: 400,
      y: tableTop,
      size: 10,
      font: helvetica,
      color: rgb(0, 0, 0),
    });
    draw('Status', {
      x: 500,
      y: tableTop,
      size: 10,
      font: helvetica,
      color: rgb(0, 0, 0),
    });

    const rows = transactions.slice(0, 20);
    rows.forEach((tx, index) => {
      const y = tableTop - 22 - index * 18;
      draw(tx.date, { x: margin, y, size: 9, font: helvetica });
      draw(tx.description, {
        x: 140,
        y,
        size: 9,
        font: helvetica,
        maxWidth: 240,
      });
      draw(this.formatCurrency(tx.amount, currency), {
        x: 400,
        y,
        size: 9,
        font: helvetica,
      });
      draw(tx.status, { x: 500, y, size: 9, font: helvetica });
    });

    const total = transactions.reduce((sum, tx) => sum + tx.amount, 0);
    draw(`Total: ${this.formatCurrency(total, currency)}`, {
      x: 400,
      y: tableTop - 22 - rows.length * 18 - 20,
      size: 11,
      font: helvetica,
      color: rgb(0.1, 0.3, 0.7),
    });

    draw('NexaFx - Secure financial statements', {
      x: margin,
      y: 30,
      size: 8,
      font: helvetica,
      color: rgb(0.4, 0.4, 0.4),
    });

    return doc.save();
  }

  private formatCurrency(value: number, currency = 'EUR'): string {
    const safeValue = Number.isFinite(value) ? value : 0;
    const decimals = CURRENCY_DECIMALS[currency.toUpperCase()] ?? 2;
    const sign = safeValue < 0 ? '-' : '';
    return `${sign}${currency.toUpperCase()} ${Math.abs(safeValue).toFixed(decimals)}`;
  }
}
