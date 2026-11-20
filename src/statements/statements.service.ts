import { getCorrelationId } from '../common/middleware/correlation-id.storage';
import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { dateDiffInDays } from './date-diff';

export { dateDiffInDays } from './date-diff';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, IsNull, Raw, Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import {
  Transaction,
  TransactionStatus,
} from '../transactions/transaction.entity';
import { FxTrade } from '../fx/fx-trade.entity';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { EmailQueueService } from '../mail/email-queue.service';
import { QUEUE_NAMES } from '../queues/queue.constants';
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
const MAX_RANGE_DAYS = 366;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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
    private readonly emailQueue: EmailQueueService,
    @Optional()
    @InjectQueue(QUEUE_NAMES.STATEMENTS)
    private readonly statementsQueue?: Queue,
  ) {}

  async generateStatement(request: StatementRequest) {
    const normalized = this.normalizeRequest(request);
    const { rangeDays } = this.parseRange(normalized.from, normalized.to);

    if (rangeDays > ASYNC_RANGE_DAYS) {
      const job = this.statementsQueue
        ? await this.statementsQueue.add('generate', {
            ...normalized,
            correlationId: getCorrelationId(),
          })
        : { id: 'statement-queued' };
      return {
        status: 'queued',
        jobId: job.id,
      };
    }

    const statement = await this.buildStatement(normalized);
    if (normalized.format === 'pdf') {
      return this.pdfService.generateStatementPdf(statement);
    }
    return statement;
  }

  async buildStatement(request: StatementRequest): Promise<StatementView> {
    const normalized = this.normalizeRequest(request);
    const { fromDate, toDate } = this.parseRange(
      normalized.from,
      normalized.to,
    );
    const user = await this.usersService.findById(normalized.userId);

    const lines = await this.collectStatementLines(
      normalized.userId,
      normalized.currency,
      fromDate,
      toDate,
    );
    const openingBalance = await this.calculateBalanceBefore(
      normalized.userId,
      normalized.currency,
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
      currency: normalized.currency,
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
    const to = statement.user.email;
    const fullName =
      `${statement.user.firstName} ${statement.user.lastName}`.trim();
    const subject = `Your ${statement.currency} statement is ready`;
    const summary =
      `${statement.currency} statement for ${statement.period.from} - ${statement.period.to}. ` +
      `Opening balance: ${statement.openingBalance}. Closing balance: ${statement.closingBalance}.`;
    const html =
      `<p>Hi ${escapeHtml(fullName)},</p><p>${escapeHtml(summary)}</p>` +
      `<p>Your statement is available in your NexaFx account.</p>`;
    const payload = { to, subject, html, text: summary };

    // Real producer for the email queue (#1610); falls back to a direct send
    // when Bull is disabled (tests / DISABLE_BULL=true).
    if (!(await this.emailQueue.enqueue(payload))) {
      await this.mailService.sendRaw(payload);
    }
  }

  private normalizeRequest(request: StatementRequest): StatementRequest {
    const currency = request.currency?.trim().toUpperCase();
    if (!currency) {
      throw new BadRequestException('currency is required');
    }
    return { ...request, currency };
  }

  private async collectStatementLines(
    userId: string,
    currency: string,
    fromDate: Date,
    toDate: Date,
  ): Promise<StatementLine[]> {
    const completed = TransactionStatus.COMPLETED;
    const inRange = Between(fromDate, toDate);

    // The range is pushed into SQL. The third clause picks up swaps credited
    // in `currency` even though the transaction row is recorded in the source
    // currency. Rows matched twice (deposit/withdrawal/swap) are de-duplicated.
    const txs = await this.txRepository.find({
      where: [
        { senderId: userId, currency, status: completed, createdAt: inRange },
        { receiverId: userId, currency, status: completed, createdAt: inRange },
        {
          senderId: userId,
          status: completed,
          createdAt: inRange,
          metadata: Raw((alias) => `${alias}->>'toCurrency' = :toCurrency`, {
            toCurrency: currency,
          }),
        },
      ],
      order: { createdAt: 'ASC' },
    });

    const seen = new Set<string>();
    const uniqueTxs = txs.filter((tx) => {
      if (seen.has(tx.id)) return false;
      seen.add(tx.id);
      return true;
    });

    const fxTrades = await this.fxRepository.find({
      where: [
        {
          userId,
          fromCurrency: currency,
          executedAt: inRange,
          reversedAt: IsNull(),
        },
        {
          userId,
          toCurrency: currency,
          executedAt: inRange,
          reversedAt: IsNull(),
        },
      ],
      order: { executedAt: 'ASC' },
    });

    const lines: StatementLine[] = [
      ...uniqueTxs.flatMap((tx) => this.mapTransaction(tx, userId, currency)),
      ...fxTrades.flatMap((trade) => {
        const rows: StatementLine[] = [];
        if (trade.fromCurrency === currency) {
          rows.push({
            date: trade.executedAt.toISOString(),
            description: `FX trade ${trade.fromCurrency} -> ${trade.toCurrency}`,
            amount: -Number(trade.fromAmount),
            reference: trade.id,
            source: 'fx',
          });
        }
        if (trade.toCurrency === currency) {
          rows.push({
            date: trade.executedAt.toISOString(),
            description: `FX trade ${trade.fromCurrency} -> ${trade.toCurrency}`,
            amount: Number(trade.toAmount),
            reference: trade.id,
            source: 'fx',
          });
        }
        return rows;
      }),
    ];

    return lines.sort((left, right) => left.date.localeCompare(right.date));
  }

  /**
   * Classify by `metadata.type`, mirroring the wallet movements performed by
   * `TransactionsService`, and emit fees as their own line so the statement
   * line total equals the wallet movement.
   */
  private mapTransaction(
    tx: Transaction,
    userId: string,
    currency: string,
  ): StatementLine[] {
    const metadata = tx.metadata ?? {};
    const type = typeof metadata.type === 'string' ? metadata.type : 'transfer';
    const amount = Number(tx.amount);
    const fee = Number(tx.fee ?? 0);
    const date = tx.createdAt.toISOString();
    const reference = tx.reference;
    const lines: StatementLine[] = [];

    const line = (
      description: string,
      value: number,
      source: StatementLine['source'] = 'transaction',
    ): StatementLine => ({
      date,
      description,
      amount: value,
      reference,
      source,
    });

    if (type === 'deposit') {
      lines.push(line('Deposit', amount));
      if (fee > 0)
        lines.push(line('Deposit fee', -Math.min(fee, amount), 'fee'));
      return lines;
    }

    if (type === 'withdrawal') {
      const destination =
        typeof metadata.destinationAddress === 'string'
          ? this.shortAddress(metadata.destinationAddress)
          : '';
      lines.push(
        line(
          destination ? `Withdrawal to ${destination}` : 'Withdrawal',
          -amount,
        ),
      );
      if (fee > 0) lines.push(line('Withdrawal fee', -fee, 'fee'));
      return lines;
    }

    if (type === 'swap') {
      const toCurrency =
        typeof metadata.toCurrency === 'string' ? metadata.toCurrency : '';
      const toAmount = Number(metadata.toAmount ?? 0);
      const description = `Swap ${tx.currency} -> ${toCurrency}`;
      if (tx.currency === currency) {
        lines.push(line(description, -amount));
        if (fee > 0) lines.push(line('Swap fee', -fee, 'fee'));
      }
      if (
        toCurrency === currency &&
        Number.isFinite(toAmount) &&
        toAmount !== 0
      ) {
        lines.push(line(description, toAmount));
      }
      return lines;
    }

    const outgoing = tx.senderId === userId && tx.receiverId !== userId;
    lines.push(
      line(
        outgoing
          ? `Transfer to ${this.shortId(tx.receiverId)}`
          : `Transfer from ${this.shortId(tx.senderId)}`,
        outgoing ? -amount : amount,
      ),
    );
    return lines;
  }

  /**
   * Opening balance is a single SQL aggregate per ledger, never a row fetch.
   * The CASE expression mirrors the same classification as `mapTransaction`.
   */
  private async calculateBalanceBefore(
    userId: string,
    currency: string,
    before: Date,
  ): Promise<number> {
    const txRow = await this.txRepository
      .createQueryBuilder('tx')
      .select(
        `COALESCE(SUM(
          CASE
            WHEN tx.metadata->>'type' = 'deposit' AND tx.currency = :currency
              THEN GREATEST(tx.amount - tx.fee, 0)
            WHEN tx.metadata->>'type' = 'swap' AND tx.currency = :currency
              THEN -tx.amount - tx.fee
            WHEN tx.metadata->>'type' = 'swap' AND tx.metadata->>'toCurrency' = :currency
              THEN COALESCE((tx.metadata->>'toAmount')::numeric, 0)
            WHEN tx."senderId" = :userId AND tx.currency = :currency
              THEN -tx.amount - tx.fee
            WHEN tx."receiverId" = :userId AND tx.currency = :currency
              THEN tx.amount
            ELSE 0
          END
        ), 0)`,
        'total',
      )
      .where('tx."createdAt" < :before', { before })
      .andWhere('tx.status = :completed', {
        completed: TransactionStatus.COMPLETED,
      })
      .andWhere(
        `(tx.currency = :currency OR tx.metadata->>'toCurrency' = :currency)`,
        { currency },
      )
      .andWhere('(tx."senderId" = :userId OR tx."receiverId" = :userId)', {
        userId,
      })
      .getRawOne<{ total: string }>();

    const fxRow = await this.fxRepository
      .createQueryBuilder('ft')
      .select(
        `COALESCE(SUM(
          CASE WHEN ft."fromCurrency" = :currency THEN -ft."fromAmount" ELSE 0 END
          +
          CASE WHEN ft."toCurrency" = :currency THEN ft."toAmount" ELSE 0 END
        ), 0)`,
        'total',
      )
      .where('ft."executedAt" < :before', { before })
      .andWhere('ft."reversedAt" IS NULL')
      .andWhere(
        '(ft."fromCurrency" = :currency OR ft."toCurrency" = :currency)',
        { currency },
      )
      .getRawOne<{ total: string }>();

    return Number(txRow?.total ?? 0) + Number(fxRow?.total ?? 0);
  }

  private parseRange(
    from: string,
    to: string,
  ): {
    fromDate: Date;
    toDate: Date;
    rangeDays: number;
  } {
    const fromDate = new Date(from);
    const toDate = new Date(to);

    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      throw new BadRequestException('from and to must be valid ISO-8601 dates');
    }
    if (toDate.getTime() < fromDate.getTime()) {
      throw new BadRequestException('to must be on or after from');
    }

    const rangeDays = dateDiffInDays(fromDate, toDate);
    if (rangeDays > MAX_RANGE_DAYS) {
      throw new BadRequestException(
        `Statement range must not exceed ${MAX_RANGE_DAYS} days`,
      );
    }

    return { fromDate, toDate, rangeDays };
  }

  private shortId(value: string): string {
    return value.length > 8 ? `${value.slice(0, 8)}...` : value;
  }

  private shortAddress(value: string): string {
    return value.length > 12
      ? `${value.slice(0, 6)}...${value.slice(-4)}`
      : value;
  }
}
