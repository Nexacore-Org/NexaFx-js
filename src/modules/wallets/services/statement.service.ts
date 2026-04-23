import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { createHash } from 'crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { TransactionEntity } from '../../transactions/entities/transaction.entity';
import { WalletEntity } from '../../users/entities/wallet.entity';

export interface StatementResult {
  walletId: string;
  currency: string;
  from: Date;
  to: Date;
  openingBalance: number;
  closingBalance: number;
  transactions: TransactionEntity[];
  checksum: string;
}

@Injectable()
export class StatementService {
  constructor(
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
    @InjectRepository(WalletEntity)
    private readonly walletRepo: Repository<WalletEntity>,
  ) {}

  async generateStatement(walletId: string, from: Date, to: Date): Promise<StatementResult> {
    const wallet = await this.walletRepo.findOne({ where: { id: walletId } });
    if (!wallet) throw new NotFoundException('Wallet not found');

    const allTxs = await this.txRepo.find({
      where: { walletId, status: 'SUCCESS' },
      order: { createdAt: 'ASC' },
    });

    const inRangeTxs = await this.txRepo.find({
      where: { walletId, createdAt: Between(from, to) },
      order: { createdAt: 'ASC' },
    });

    const openingBalance = this.computeBalance(allTxs.filter((t) => t.createdAt < from));
    const closingBalance = this.computeBalance(allTxs.filter((t) => t.createdAt <= to));

    const payload = JSON.stringify({ walletId, from, to, openingBalance, closingBalance, count: inRangeTxs.length });
    const checksum = createHash('sha256').update(payload).digest('hex');

    return { walletId, currency: wallet.type, from, to, openingBalance, closingBalance, transactions: inRangeTxs, checksum };
  }

  async generateStatementPdf(walletId: string, from: Date, to: Date): Promise<{ pdf: Buffer; checksum: string }> {
    const statement = await this.generateStatement(walletId, from, to);

    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
    const page = doc.addPage([595, 842]); // A4
    const { width, height } = page.getSize();
    let y = height - 50;

    const draw = (text: string, x: number, size = 10, bold = false) => {
      page.drawText(text, { x, y, size, font: bold ? boldFont : font, color: rgb(0, 0, 0) });
    };

    // Header
    draw('NexaFx Wallet Statement', 50, 16, true);
    y -= 25;
    draw(`Wallet ID: ${statement.walletId}`, 50, 9);
    y -= 14;
    draw(`Currency: ${statement.currency}`, 50, 9);
    y -= 14;
    draw(`Period: ${from.toISOString().slice(0, 10)} to ${to.toISOString().slice(0, 10)}`, 50, 9);
    y -= 20;

    // Balances
    draw(`Opening Balance: ${statement.openingBalance.toFixed(2)} ${statement.currency}`, 50, 10, true);
    y -= 16;
    draw(`Closing Balance: ${statement.closingBalance.toFixed(2)} ${statement.currency}`, 50, 10, true);
    y -= 25;

    // Table header
    draw('Date', 50, 9, true);
    draw('Description', 150, 9, true);
    draw('Amount', 420, 9, true);
    draw('Status', 490, 9, true);
    y -= 5;
    page.drawLine({ start: { x: 50, y }, end: { x: width - 50, y }, thickness: 0.5, color: rgb(0.5, 0.5, 0.5) });
    y -= 14;

    // Transactions
    for (const tx of statement.transactions) {
      if (y < 80) break; // avoid overflow
      draw(tx.createdAt.toISOString().slice(0, 10), 50, 8);
      const desc = (tx.description ?? tx.id.slice(0, 16)).slice(0, 30);
      draw(desc, 150, 8);
      draw(Number(tx.amount).toFixed(2), 420, 8);
      draw(tx.status, 490, 8);
      y -= 14;
    }

    // Footer with checksum
    y = 40;
    page.drawLine({ start: { x: 50, y: y + 10 }, end: { x: width - 50, y: y + 10 }, thickness: 0.5, color: rgb(0.5, 0.5, 0.5) });
    draw(`SHA-256: ${statement.checksum}`, 50, 7);

    const pdfBytes = await doc.save();
    return { pdf: Buffer.from(pdfBytes), checksum: statement.checksum };
  }

  private computeBalance(txs: TransactionEntity[]): number {
    return txs.reduce((sum, tx) => {
      const amount = Number(tx.amount);
      const isCredit = tx.metadata?.type === 'CREDIT' || tx.fromAddress == null;
      return sum + (isCredit ? amount : -amount);
    }, 0);
  }
}
