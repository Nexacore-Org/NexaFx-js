import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Transaction } from '../transactions/transaction.entity';
import { FxTrade } from '../fx/fx-trade.entity';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { PdfService } from '../documents/pdf.service';
import { StatementLine, StatementView } from './statements.types';

export interface StatementRequest {
  userId: string;
  currency: string;
  from: string;
  to: string;
  format?: 'json' | 'pdf';
}

const ASYNC_RANGE_DAYS = 31;

@Injectable()
export class StatementsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly txRepository: Repository<Transaction>,
    @InjectRepository(FxTrade)
    private readonly fxRepository: Repository<FxTrade>,
    private readonly usersService: UsersService,
    private readonly pdfService: PdfService,
    private readonly mailService: MailService,
    @Optional()
    @InjectQueue('statements')
    private readonly statementsQueue?: Queue,
  ) {}

  async generateStatement(request: StatementRequest) {
    const rangeDays = this.dateDiffInDays(request.from, request.to);
    if (rangeDays > ASYNC_RANGE_DAYS) {
      const job = this.statementsQueue
        ? await this.statementsQueue.add('generate', request)
        : { id: 'statement-queued' };
      return {
        status: 'queued',
        jobId: job.id,
      };
    }

    const statement = await this.buildStatement(request);
    if (request.format === 'pdf') {
      return this.pdfService.generateStatementPdf(statement);
    }
    return statement;
  }

  async buildStatement(request: StatementRequest): Promise<StatementView> {
    const user = await this.usersService.findById(request.userId);

    const fromDate = new Date(request.from);
    const toDate = new Date(request.to);
    const lines = await this.collectStatementLines(
      request.userId,
      request.currency,
      fromDate,
      toDate,
    );
    const openingBalance = await this.calculateBalanceBefore(
      request.userId,
      request.currency,
      fromDate,
    );
    const closingBalance =
      openingBalance + lines.reduce((sum, line) => sum + line.amount, 0);

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      currency: request.currency.toUpperCase(),
      period: {
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
      },
      openingBalance,
      closingBalance,
      lines,
      generatedAt: new Date().toISOString(),
    };
  }

  async sendStatementNotification(
    _request: StatementRequest,
    statement: StatementView,
  ): Promise<void> {
    await this.mailService.sendStatementReadyEmail({
      to: statement.user.email,
      fullName: `${statement.user.firstName} ${statement.user.lastName}`,
      currency: statement.currency,
      from: statement.period.from,
      toDate: statement.period.to,
      openingBalance: statement.openingBalance,
      closingBalance: statement.closingBalance,
    });
  }

  private async collectStatementLines(
    userId: string,
    currency: string,
    fromDate: Date,
    toDate: Date,
  ): Promise<StatementLine[]> {
    const txs = await this.txRepository.find({
      where: [
        { senderId: userId, currency },
        { receiverId: userId, currency },
      ],
      order: { createdAt: 'ASC' },
    });
    const fxTrades = await this.fxRepository.find({
      where: { userId },
      order: { executedAt: 'ASC' },
    });

    const lines: StatementLine[] = [
      ...txs.map((tx) => ({
        date: tx.createdAt.toISOString(),
        description:
          tx.senderId === userId
            ? `Transfer to ${tx.receiverId}`
            : `Transfer from ${tx.senderId}`,
        amount: tx.senderId === userId ? -Number(tx.amount) : Number(tx.amount),
        reference: tx.reference,
        source: 'transaction' as const,
      })),
      ...fxTrades.flatMap((trade) => {
        const rows: StatementLine[] = [];
        if (trade.fromCurrency === currency) {
          rows.push({
            date: trade.executedAt.toISOString(),
            description: `FX trade: ${trade.fromCurrency} -> ${trade.toCurrency}`,
            amount: -Number(trade.fromAmount),
            reference: trade.id,
            source: 'fx',
          });
        }
        if (trade.toCurrency === currency) {
          rows.push({
            date: trade.executedAt.toISOString(),
            description: `FX trade: ${trade.fromCurrency} -> ${trade.toCurrency}`,
            amount: Number(trade.toAmount),
            reference: trade.id,
            source: 'fx',
          });
        }
        return rows;
      }),
    ].filter((line) => {
      const lineDate = new Date(line.date);
      return lineDate >= fromDate && lineDate <= toDate;
    });

    return lines.sort((left, right) => left.date.localeCompare(right.date));
  }

  private async calculateBalanceBefore(
    userId: string,
    currency: string,
    before: Date,
  ): Promise<number> {
    const txs = await this.txRepository.find({
      where: [
        { senderId: userId, currency },
        { receiverId: userId, currency },
      ],
      order: { createdAt: 'ASC' },
    });
    const fxTrades = await this.fxRepository.find({
      where: { userId },
      order: { executedAt: 'ASC' },
    });

    const entries: StatementLine[] = [
      ...txs.map((tx) => ({
        date: tx.createdAt.toISOString(),
        description: '',
        amount: tx.senderId === userId ? -Number(tx.amount) : Number(tx.amount),
        reference: tx.reference,
        source: 'transaction' as const,
      })),
      ...fxTrades.flatMap((trade) => {
        const rows: StatementLine[] = [];
        if (trade.fromCurrency === currency) {
          rows.push({
            date: trade.executedAt.toISOString(),
            description: '',
            amount: -Number(trade.fromAmount),
            reference: trade.id,
            source: 'fx',
          });
        }
        if (trade.toCurrency === currency) {
          rows.push({
            date: trade.executedAt.toISOString(),
            description: '',
            amount: Number(trade.toAmount),
            reference: trade.id,
            source: 'fx',
          });
        }
        return rows;
      }),
    ];

    return entries
      .filter((entry) => new Date(entry.date) < before)
      .reduce((sum, entry) => sum + entry.amount, 0);
  }

  private dateDiffInDays(from: string, to: string): number {
    return Math.ceil(
      (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000,
    );
  }
}
