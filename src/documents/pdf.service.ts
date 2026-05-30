import { Injectable } from '@nestjs/common';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

interface TransactionRecord {
  id: string;
  date: string;
  description: string;
  amount: number;
  status: string;
}

@Injectable()
export class PdfService {
  async generateStatementPdf(userId: string, from?: string, to?: string): Promise<Uint8Array> {
    const fromDate = from ? new Date(from) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to) : new Date();

    const transactions = this.sampleTransactions(userId).filter((tx) => {
      const txDate = new Date(tx.date);
      return txDate >= fromDate && txDate <= toDate;
    });

    return this.buildPdf(
      `Statement for ${userId}`,
      userId,
      [
        `Statement period: ${fromDate.toISOString().substring(0, 10)} - ${toDate.toISOString().substring(0, 10)}`,
        `Generated: ${new Date().toISOString()}`,
      ],
      transactions,
    );
  }

  async generateReceiptPdf(transactionId: string): Promise<Uint8Array> {
    const transaction = this.sampleTransactions('receipt-user').find((tx) => tx.id === transactionId) ?? {
      id: transactionId,
      date: new Date().toISOString().substring(0, 10),
      description: 'Transaction receipt',
      amount: 0,
      status: 'Unknown',
    };

    return this.buildPdf(
      `Receipt ${transaction.id}`,
      `User ${transactionId.substring(0, 6)}`,
      [`Receipt generated: ${new Date().toISOString()}`],
      [transaction],
    );
  }

  private async buildPdf(
    heading: string,
    userName: string,
    metadata: string[],
    transactions: TransactionRecord[],
  ): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    const helvetica = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([612, 792]);
    const { width, height } = page.getSize();
    const margin = 50;
    const lineHeight = 16;

    page.drawText('NexaFx', {
      x: margin,
      y: height - margin,
      size: 24,
      font: helvetica,
      color: rgb(0.1, 0.3, 0.7),
    });

    page.drawText(heading, {
      x: margin,
      y: height - margin - 36,
      size: 14,
      font: helvetica,
      color: rgb(0, 0, 0),
    });

    page.drawText(`Account: ${userName}`, {
      x: margin,
      y: height - margin - 60,
      size: 10,
      font: helvetica,
      color: rgb(0.2, 0.2, 0.2),
    });

    metadata.forEach((text, index) => {
      page.drawText(text, {
        x: margin,
        y: height - margin - 80 - index * lineHeight,
        size: 10,
        font: helvetica,
        color: rgb(0.2, 0.2, 0.2),
      });
    });

    const tableTop = height - margin - 140;
    page.drawText('Date', { x: margin, y: tableTop, size: 10, font: helvetica, color: rgb(0, 0, 0) });
    page.drawText('Description', { x: 140, y: tableTop, size: 10, font: helvetica, color: rgb(0, 0, 0) });
    page.drawText('Amount', { x: 400, y: tableTop, size: 10, font: helvetica, color: rgb(0, 0, 0) });
    page.drawText('Status', { x: 500, y: tableTop, size: 10, font: helvetica, color: rgb(0, 0, 0) });

    const rows = transactions.slice(0, 20);
    rows.forEach((tx, index) => {
      const y = tableTop - 22 - index * 18;
      page.drawText(tx.date, { x: margin, y, size: 9, font: helvetica });
      page.drawText(tx.description, { x: 140, y, size: 9, font: helvetica, maxWidth: 240 });
      page.drawText(this.formatCurrency(tx.amount), { x: 400, y, size: 9, font: helvetica });
      page.drawText(tx.status, { x: 500, y, size: 9, font: helvetica });
    });

    const total = transactions.reduce((sum, tx) => sum + tx.amount, 0);
    page.drawText(`Total: ${this.formatCurrency(total)}`, {
      x: 400,
      y: tableTop - 22 - rows.length * 18 - 20,
      size: 11,
      font: helvetica,
      color: rgb(0.1, 0.3, 0.7),
    });

    page.drawText('NexaFx - Secure financial statements', {
      x: margin,
      y: 30,
      size: 8,
      font: helvetica,
      color: rgb(0.4, 0.4, 0.4),
    });

    return doc.save();
  }

  private sampleTransactions(userId: string): TransactionRecord[] {
    return [
      {
        id: `${userId}-txn-001`,
        date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10),
        description: 'EUR deposit',
        amount: 1420.5,
        status: 'Completed',
      },
      {
        id: `${userId}-txn-002`,
        date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10),
        description: 'FX transfer to USD',
        amount: -520.0,
        status: 'Completed',
      },
      {
        id: `${userId}-txn-003`,
        date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10),
        description: 'Service fee',
        amount: -12.75,
        status: 'Completed',
      },
    ];
  }

  private formatCurrency(value: number): string {
    return `${value < 0 ? '-' : ''}€${Math.abs(value).toFixed(2)}`;
  }
}
