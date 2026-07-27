import { Injectable, BadRequestException, ForbiddenException, Logger, NotFoundException, UnprocessableEntityException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository, DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import Big from 'big.js';
import { Transaction, TransactionStatus } from './transaction.entity';
import { WalletsService } from '../wallet/wallets.service';
import { StellarService } from '../stellar/stellar.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { UsersService } from '../users/users.service';
import { TransactionLimitService } from './transaction-limit.service';
import { TermsAcceptanceService } from '../terms/terms-acceptance.service';
import { UserDeactivationService } from '../modules/user-deactivation/services/user-deactivation.service';
import { FeesService } from '../fees/fees.service';

export interface TransferDto {
  senderId: string;
  receiverId: string;
  amount: number;
  currency: string;
  reference: string;
  metadata?: Record<string, unknown>;
}

export interface TransactionFilters {
  userId?: string;
  status?: TransactionStatus;
  currency?: string;
  receiptNumber?: string;
  startDate?: string;
  endDate?: string;
  type?: string;
  page?: number;
  limit?: number;
}

export interface SwapPreviewDto {
  userId: string;
  fromAmount: number;
  fromCurrency: string;
  toCurrency: string;
}

export interface SwapPreviewResponse {
  fromCurrency: string;
  toCurrency: string;
  fromAmount: number;
  toAmount: number;
  rate: number;
}

export interface ReverseTransactionDto {
  reason: string;
}

export interface DepositDto {
  userId: string;
  amount: number;
  currency: string;
  reference: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export interface WithdrawalDto {
  userId: string;
  amount: number;
  currency: string;
  reference: string;
  destinationAddress: string;
  metadata?: Record<string, unknown>;
}

export interface SwapDto {
  userId: string;
  fromAmount: number;
  fromCurrency: string;
  toAmount: number;
  toCurrency: string;
  reference: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

const MAX_RETRIES = 3;

@Injectable()
export class TransactionsService implements OnModuleInit {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
    private readonly dataSource: DataSource,
    private readonly walletsService: WalletsService,
    private readonly stellarService: StellarService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
    private readonly mailService: MailService,
    private readonly usersService: UsersService,
    private readonly events: EventEmitter2,
    private readonly limitService: TransactionLimitService,
    private readonly feesService: FeesService,
    private readonly deactivationService: UserDeactivationService,
    private readonly termsService: TermsAcceptanceService,
  ) {}

  async onModuleInit(): Promise<void> {
    const secret = this.configService.get<string>('STELLAR_HOT_WALLET_SECRET');
    if (!secret) {
      throw new Error(
        '[STARTUP BLOCKED] STELLAR_HOT_WALLET_SECRET is not configured. ' +
          'Set it in your environment variables before starting the server.',
      );
    }
  }

  private getStellarSecretKey(): string {
    const secret = this.configService.get<string>('STELLAR_HOT_WALLET_SECRET');
    if (!secret) {
      throw new BadRequestException('Stellar secret key is not configured');
    }
    return secret;
  }

  async transfer(dto: TransferDto): Promise<Transaction> {
    await this.termsService.ensureAccepted(dto.senderId);

    const isDeactivated = await this.deactivationService.isUserDeactivated(dto.senderId);
    if (isDeactivated) {
      throw new ForbiddenException('Account has been deactivated. Cannot perform transactions.');
    }

    if (dto.amount <= 0) {
      throw new BadRequestException('Transfer amount must be positive');
    }
    if (dto.senderId === dto.receiverId) {
      throw new BadRequestException('Sender and receiver must differ');
    }

    const senderBalance = await this.walletsService.getBalance(
      dto.senderId,
      dto.currency,
    );
    if (senderBalance.balance < dto.amount) {
      throw new BadRequestException('Insufficient balance');
    }

    // Phase 1: persist PENDING record before any blockchain/balance changes
    const tx = this.txRepo.create({ ...dto, status: TransactionStatus.PENDING });
    await this.txRepo.save(tx);
    await this.generateReceiptNumber(tx);

    try {
      await this.dataSource.transaction(async (manager) => {
        await this.walletsService.adjustBalance(dto.senderId, dto.currency, -dto.amount);
        await this.walletsService.adjustBalance(dto.receiverId, dto.currency, dto.amount);

        tx.status = TransactionStatus.COMPLETED;
        tx.completedAt = new Date();
        await manager.save(Transaction, tx);
      });
    } catch (err) {
      // Phase 2 failure: DB write after balance adjustment failed.
      // Leave record as PENDING so reconciliation can recover it.
      this.logger.error(
        `CRITICAL: DB confirmation write failed for transaction ${tx.id} (ref=${tx.reference}). ` +
          `Record left as PENDING for reconciliation recovery.`,
        err instanceof Error ? err.stack : String(err),
      );
      return tx;
    }

    this.events.emit('transactions.completed', {
      transactionId: tx.id,
      senderId: tx.senderId,
      receiverId: tx.receiverId,
      amount: tx.amount,
      currency: tx.currency,
      reference: tx.reference,
    });
    return tx;
  }

  private static readonly DEFAULT_LIMIT = 20;
  private static readonly MAX_LIMIT = 100;

  async findHistory(filters: TransactionFilters): Promise<{
    items: Transaction[];
    total: number;
    page: number;
    limit: number;
  }> {
    const {
      userId,
      status,
      currency,
      receiptNumber,
      startDate,
      endDate,
      type,
      page = 1,
      limit,
    } = filters;

    const effectiveLimit = Math.min(
      Math.max(limit ?? TransactionsService.DEFAULT_LIMIT, 1),
      TransactionsService.MAX_LIMIT,
    );

    const qb = this.txRepo
      .createQueryBuilder('tx')
      .orderBy('tx.createdAt', 'DESC')
      .skip((page - 1) * effectiveLimit)
      .take(effectiveLimit)
      .leftJoinAndSelect('tx.sender', 'sender')
      .leftJoinAndSelect('tx.receiver', 'receiver');

    if (userId) {
      qb.andWhere('(tx.senderId = :uid OR tx.receiverId = :uid)', {
        uid: userId,
      });
    }
    if (status) {
      qb.andWhere('tx.status = :status', { status });
    }
    if (currency) {
      qb.andWhere('tx.currency = :currency', { currency });
    }
    if (receiptNumber) {
      qb.andWhere('tx.receiptNumber = :receiptNumber', { receiptNumber });
    }
    if (startDate) {
      qb.andWhere('tx.createdAt >= :startDate', { startDate });
    }
    if (endDate) {
      qb.andWhere('tx.createdAt <= :endDate', { endDate });
    }
    if (type) {
      qb.andWhere("tx.metadata->>'type' = :type", { type });
    }

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit: effectiveLimit };
  }

  async findById(id: string): Promise<Transaction> {
    const tx = await this.txRepo.findOne({ where: { id } });
    if (!tx) throw new NotFoundException(`Transaction ${id} not found`);
    return tx;
  }

  async updateTags(
    id: string,
    userId: string,
    tag?: string,
    tags?: string[],
  ): Promise<Transaction> {
    const tx = await this.findById(id);
    if (tx.senderId !== userId) {
      throw new BadRequestException('Only the sender can tag a transaction');
    }
    if (tag !== undefined) tx.tag = tag;
    if (tags !== undefined) tx.tags = tags;
    return this.txRepo.save(tx);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private checkDailyLimit(_amount: number): void {
    // Superseded by TransactionLimitService.check() — kept as no-op for backward compat
  }

  /** Generate NXF-YYYY-NNNNNN receipt number using a DB sequence (postgres) or timestamp fallback. */
  private async generateReceiptNumber(tx: Transaction): Promise<void> {
    try {
      const result = await this.dataSource.query(
        `SELECT nextval('transaction_receipt_seq') AS seq`,
      ) as Array<{ seq: string }>;
      const seq = String(result[0].seq).padStart(6, '0');
      const year = new Date().getFullYear();
      tx.receiptNumber = `NXF-${year}-${seq}`;
    } catch {
      // Fallback for non-postgres envs (e.g. sqlite in tests)
      tx.receiptNumber = `NXF-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
    }
    await this.txRepo.save(tx);
  }

  // ---------------------------------------------------------------------------
  // Deposit — credits user balance (no deduction on failure, no rollback needed)
  // ---------------------------------------------------------------------------

  async createDeposit(dto: DepositDto): Promise<Transaction> {
    await this.termsService.ensureAccepted(dto.userId);
    const fee = this.feesService.calculateFee(dto.amount);
    const totalChecked = dto.amount + fee.feeAmount; // #742: fee included in limit check
    await this.limitService.check(dto.userId, totalChecked, dto.currency);

    const tx = this.txRepo.create({
      senderId: dto.userId,
      receiverId: dto.userId,
      amount: dto.amount,
      currency: dto.currency,
      fee: fee.feeAmount,
      reference: dto.reference,
      metadata: { ...dto.metadata, type: 'deposit', fullTransactionId: tx.id },
      status: TransactionStatus.PENDING,
    });
    await this.txRepo.save(tx);
    await this.generateReceiptNumber(tx);

    try {
      // Stellar / blockchain submission would happen here
      await this.walletsService.adjustBalance(dto.userId, dto.currency, dto.amount);
      tx.status = TransactionStatus.COMPLETED;
      tx.completedAt = new Date();
      await this.txRepo.save(tx);
      await this.usersService.invalidateWalletBalanceCache(dto.userId);
      this.events.emit('transactions.deposit.completed', { transactionId: tx.id, userId: dto.userId });
      return tx;
    } catch (err) {
      // Deposit failed — no balance was credited, so no rollback required
      tx.status = TransactionStatus.FAILED;
      await this.txRepo.save(tx);
      await this.auditService.log({
        userId: dto.userId,
        action: 'transaction.deposit.failed',
        entityType: 'transaction',
        entityId: tx.id,
        after: { error: (err as Error).message },
      });
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Withdrawal — #739: restore balance on Stellar failure; #742: fee-before-limit
  // ---------------------------------------------------------------------------

  async createWithdrawal(dto: WithdrawalDto): Promise<Transaction> {
    const fee = this.feesService.calculateFee(dto.amount);
    await this.termsService.ensureAccepted(dto.userId);

    // #789: Check destination account exists before proceeding
    const destinationExists = await this.stellarService.accountExists(dto.destinationAddress);
    if (!destinationExists) {
      throw new BadRequestException(
        `Destination Stellar account (${dto.destinationAddress}) is not funded. ` +
          'The recipient account must have a minimum balance of 1 XLM.',
      );
    }

    const totalChecked = dto.amount + fee.feeAmount; // #742: fee included in limit check
    await this.limitService.check(dto.userId, totalChecked, dto.currency);

    const balance = await this.walletsService.getBalance(dto.userId, dto.currency);
    if (balance.balance < totalChecked) {
      throw new BadRequestException('Insufficient balance including fee');
    }

    const tx = this.txRepo.create({
      senderId: dto.userId,
      receiverId: dto.userId,
      amount: dto.amount,
      currency: dto.currency,
      fee: fee.feeAmount,
      reference: dto.reference,
      metadata: { ...dto.metadata, type: 'withdrawal', destinationAddress: dto.destinationAddress },
      status: TransactionStatus.PENDING,
    });
    await this.txRepo.save(tx);
    await this.generateReceiptNumber(tx);

    await this.walletsService.adjustBalance(dto.userId, dto.currency, -totalChecked);

    try {
      // Stellar / blockchain submission would happen here
      tx.status = TransactionStatus.COMPLETED;
      tx.completedAt = new Date();
      await this.txRepo.save(tx);
      await this.usersService.invalidateWalletBalanceCache(dto.userId);
      this.events.emit('transactions.withdrawal.completed', { transactionId: tx.id, userId: dto.userId });
      return tx;
    } catch (err) {
      // #739: Restore deducted balance on Stellar failure
      await this.walletsService.adjustBalance(dto.userId, dto.currency, +totalChecked);
      tx.status = TransactionStatus.FAILED;
      await this.txRepo.save(tx);
      await this.auditService.log({
        userId: dto.userId,
        action: 'transaction.withdrawal.failed_refunded',
        entityType: 'transaction',
        entityId: tx.id,
        after: { refundedAmount: totalChecked, error: (err as Error).message },
      });
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Swap — #741: only write FAILED after all retries; track retryCount
  // #742: fee-before-limit check
  // ---------------------------------------------------------------------------

  async createSwap(dto: SwapDto): Promise<Transaction> {
    await this.termsService.ensureAccepted(dto.userId);
    const fee = this.feesService.calculateFee(dto.fromAmount);
    const totalChecked = dto.fromAmount + fee.feeAmount; // #742: fee included in limit check
    await this.limitService.check(dto.userId, totalChecked, dto.fromCurrency);

    const balance = await this.walletsService.getBalance(dto.userId, dto.fromCurrency);
    if (new Big(String(balance.balance)).lt(totalChecked)) {
      throw new BadRequestException('Insufficient balance including fee');
    }

    const tx = this.txRepo.create({
      senderId: dto.userId,
      receiverId: dto.userId,
      amount: dto.fromAmount,
      currency: dto.fromCurrency,
      fee: fee.feeAmount,
      reference: dto.reference,
      metadata: { ...dto.metadata, type: 'swap', toAmount: dto.toAmount, toCurrency: dto.toCurrency },
      status: TransactionStatus.PENDING,
      retryCount: 0,
    });
    await this.txRepo.save(tx);

    await this.walletsService.adjustBalance(dto.userId, dto.fromCurrency, -totalChecked);

    let lastError: Error | undefined;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        // Stellar / blockchain swap submission would happen here
        await this.walletsService.adjustBalance(dto.userId, dto.toCurrency, dto.toAmount);
        tx.status = TransactionStatus.COMPLETED;
        tx.completedAt = new Date();
        tx.retryCount = attempt;
        await this.txRepo.save(tx);
        await this.feesService.recordFee({
          transactionId: tx.id,
          userId: dto.userId,
          transactionType: 'swap',
          amount: dto.fromAmount,
          feeAmount: fee.feeAmount,
          currency: dto.fromCurrency,
          reason: fee.reason,
        });
        this.events.emit('transactions.swap.completed', { transactionId: tx.id, userId: dto.userId });
        return tx;
      } catch (err) {
        lastError = err as Error;
        tx.retryCount = attempt + 1;
        // #741: do NOT persist FAILED status on intermediate failures — only log
        this.logger.warn(
          `Swap attempt ${attempt + 1}/${MAX_RETRIES} failed for tx ${tx.id}: ${lastError.message}`,
        );
        // Persist only retryCount, not FAILED status yet
        await this.txRepo.save(tx);
      }
    }

    // All retries exhausted — restore balance, then write FAILED (#741)
    await this.walletsService.adjustBalance(dto.userId, dto.fromCurrency, +totalChecked);
    tx.status = TransactionStatus.FAILED;
    await this.txRepo.save(tx);

    await this.auditService.log({
      userId: dto.userId,
      action: 'transaction.swap.failed_refunded',
      entityType: 'transaction',
      entityId: tx.id,
      after: { retryCount: tx.retryCount, refundedAmount: totalChecked, error: lastError?.message },
    });
    this.events.emit('transactions.swap.failed', { transactionId: tx.id, userId: dto.userId });

    throw lastError;
  }

  // ---------------------------------------------------------------------------
  // Swap Preview — #904: indicative exchange rate in preview response
  // ---------------------------------------------------------------------------

  async getSwapPreview(dto: SwapPreviewDto): Promise<SwapPreviewResponse> {
    if (dto.fromAmount <= 0) {
      throw new BadRequestException('Swap amount must be positive');
    }
    if (dto.fromCurrency === dto.toCurrency) {
      throw new BadRequestException('Source and target currencies must differ');
    }

    const fee = this.feesService.calculateFee(dto.fromAmount);
    const feeAdjustedAmount = dto.fromAmount - fee.feeAmount;

    // Indicative rate: how many toCurrency units per 1 fromCurrency unit
    // In production this would query a price oracle; placeholder rate for now.
    const rate = parseFloat((0.85 + Math.random() * 0.3).toFixed(6));
    const toAmount = parseFloat((feeAdjustedAmount * rate).toFixed(8));

    return {
      fromCurrency: dto.fromCurrency,
      toCurrency: dto.toCurrency,
      fromAmount: dto.fromAmount,
      toAmount,
      rate,
    };
  }

  // ---------------------------------------------------------------------------
  // Cancel Transaction — #905: cancel PENDING transactions
  // ---------------------------------------------------------------------------

  async exportTransactionsCsv(userId: string): Promise<string> {
    const { items } = await this.findHistory({ userId, limit: 1000 });
    const header = 'id,reference,senderId,receiverId,amount,currency,status,createdAt\n';
    const rows = items
      .map(
        (tx) =>
          `"${tx.id}","${tx.reference}","${tx.senderId}","${tx.receiverId}",${tx.amount},"${tx.currency}","${tx.status}","${tx.createdAt?.toISOString?.() || tx.createdAt}"`,
      )
      .join('\n');
    return header + rows;
  }

  async createInternalTransfer(dto: { senderId: string; recipientEmail: string; amount: number; currency: string }): Promise<Transaction> {
    const recipient = await this.usersService.findByEmail(dto.recipientEmail);
    if (!recipient) throw new NotFoundException(`Recipient with email ${dto.recipientEmail} not found`);
    return this.transfer({
      senderId: dto.senderId,
      receiverId: recipient.id,
      amount: dto.amount,
      currency: dto.currency,
      reference: `int_${Date.now()}`,
      metadata: { isInternalTransfer: true, recipientEmail: dto.recipientEmail },
    });
  }

  async simulateTransaction(dto: { type: string; amount: number; fromCurrency: string; toCurrency?: string }) {
    const fee = this.feesService.calculateFee(dto.amount);
    const estimatedOutput = dto.toCurrency ? Number((dto.amount * 0.985).toFixed(4)) : dto.amount;
    return {
      simulationId: `sim_${Date.now()}`,
      type: dto.type,
      inputAmount: dto.amount,
      estimatedOutput,
      fee: fee.feeAmount,
      estimatedSlippagePct: 0.15,
      route: dto.toCurrency ? [dto.fromCurrency, dto.toCurrency] : [dto.fromCurrency],
      status: 'SIMULATION_SUCCESS',
    };
  }

  async cancelTransaction(id: string): Promise<Transaction> {
    const tx = await this.findById(id);
    if (tx.status !== TransactionStatus.PENDING) {
      throw new UnprocessableEntityException(
        `Transaction ${id} cannot be cancelled (current status: ${tx.status})`,
      );
    }

    tx.status = TransactionStatus.CANCELLED;
    await this.txRepo.save(tx);

    this.events.emit('transactions.cancelled', { transactionId: tx.id });
    return tx;
  }

  // ---------------------------------------------------------------------------
  // Reverse
  // ---------------------------------------------------------------------------

  async reverseTransaction(
    id: string,
    input: { reversedBy: string; reason: string },
  ): Promise<Transaction> {
    const transaction = await this.findById(id);
    if (transaction.reversedAt) {
      throw new UnprocessableEntityException(
        'Transaction has already been reversed',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      await this.walletsService.adjustBalance(
        transaction.senderId,
        transaction.currency,
        Number(new Big(transaction.amount).toFixed(8)),
      );
      await this.walletsService.adjustBalance(
        transaction.receiverId,
        transaction.currency,
        Number(new Big(transaction.amount).neg().toFixed(8)),
      );

      const reversal = manager.create(Transaction, {
        senderId: transaction.receiverId,
        receiverId: transaction.senderId,
        amount: transaction.amount,
        currency: transaction.currency,
        fee: 0,
        status: TransactionStatus.REVERSED,
        reference: `${transaction.reference}-reversal`,
        metadata: {
          reversalOf: transaction.id,
          reason: input.reason,
        },
        completedAt: new Date(),
      });
      const savedReversal = await manager.save(Transaction, reversal);

      transaction.status = TransactionStatus.REVERSED;
      transaction.reversedAt = new Date();
      transaction.reversedBy = input.reversedBy;
      transaction.reversalReason = input.reason;
      transaction.reversalTransactionId = savedReversal.id;
      await manager.save(Transaction, transaction);

      const sender = await this.usersService.findById(transaction.senderId);
      const receiver = await this.usersService.findById(transaction.receiverId);

      this.mailService.sendTransactionReversalNotice({
        to: sender.email,
        transactionId: transaction.id,
        reversedBy: input.reversedBy,
        reason: input.reason,
      });
      this.mailService.sendTransactionReversalNotice({
        to: receiver.email,
        transactionId: transaction.id,
        reversedBy: input.reversedBy,
        reason: input.reason,
      });

      await this.auditService.log({
        userId: input.reversedBy,
        action: 'transaction.reversed',
        entityType: 'transaction',
        entityId: transaction.id,
        after: {
          reversalTransactionId: savedReversal.id,
          reason: input.reason,
        },
      });

      this.events.emit('transactions.reversed', {
        transactionId: transaction.id,
        reversalTransactionId: savedReversal.id,
        reversedBy: input.reversedBy,
        reason: input.reason,
      });

      return transaction;
    });
  }
}
