import { Injectable } from '@nestjs/common';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { StatementView } from '../statements/statements.types';

interface ReceiptRecord {
  id: string;
  date: string;
  description: string;
  amount: number;
  status: string;
}

@Injectable()
export class PdfService {
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
    );
  }

  async generateReceiptPdf(transactionId: string): Promise<Uint8Array> {
    const transaction = this.sampleTransactions('receipt-user').find(
      (tx) => tx.id === transactionId,
    ) ?? {
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
    transactions: ReceiptRecord[],
  ): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    const helvetica = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([612, 792]);
    const { height } = page.getSize();
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
    page.drawText('Date', {
      x: margin,
      y: tableTop,
      size: 10,
      font: helvetica,
      color: rgb(0, 0, 0),
    });
    page.drawText('Description', {
      x: 140,
      y: tableTop,
      size: 10,
      font: helvetica,
      color: rgb(0, 0, 0),
    });
    page.drawText('Amount', {
      x: 400,
      y: tableTop,
      size: 10,
      font: helvetica,
      color: rgb(0, 0, 0),
    });
    page.drawText('Status', {
      x: 500,
      y: tableTop,
      size: 10,
      font: helvetica,
      color: rgb(0, 0, 0),
    });

    const rows = transactions.slice(0, 20);
    rows.forEach((tx, index) => {
      const y = tableTop - 22 - index * 18;
      page.drawText(tx.date, { x: margin, y, size: 9, font: helvetica });
      page.drawText(tx.description, {
        x: 140,
        y,
        size: 9,
        font: helvetica,
        maxWidth: 240,
      });
      page.drawText(this.formatCurrency(tx.amount), {
        x: 400,
        y,
        size: 9,
        font: helvetica,
      });
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

  private sampleTransactions(userId: string): ReceiptRecord[] {
    return [
      {
        id: `${userId}-txn-001`,
        date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
          .toISOString()
          .substring(0, 10),
        description: 'EUR deposit',
        amount: 1420.5,
        status: 'Completed',
      },
      {
        id: `${userId}-txn-002`,
        date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
          .toISOString()
          .substring(0, 10),
        description: 'FX transfer to USD',
        amount: -520.0,
        status: 'Completed',
      },
      {
        id: `${userId}-txn-003`,
        date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
          .toISOString()
          .substring(0, 10),
        description: 'Service fee',
        amount: -12.75,
        status: 'Completed',
      },
    ];
  }

  private formatCurrency(value: number, currency = 'EUR'): string {
    return `${value < 0 ? '-' : ''}${currency.toUpperCase()} ${Math.abs(value).toFixed(2)}`;
  }
}
