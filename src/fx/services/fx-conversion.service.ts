import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';

import { FxQuote, QuoteStatus } from '../entities/fx-quote.entity';
import { FxConversion, ConversionStatus } from '../entities/fx-conversion.entity';
import { FeeCalculatorService } from './fee-calculator.service';
import { RegulatoryDisclosureService } from './regulatory-disclosure.service';
import { LoyaltyTier } from '../../loyalty-point/loyalty-account.entity';
import { RateProviderService } from './rate-provider.service';
import { ConfigService } from '@nestjs/config';
import { DisputesService } from '../../modules/disputes/services/disputes.service';
import { AdminAuditService, ActorType } from '../../modules/admin-audit/admin-audit.service';
import { WalletEntity } from '../../modules/users/entities/wallet.entity';
import { TransactionEntity, TransactionDirection, TransactionStatus } from '../../modules/transactions/entities/transaction.entity';
import { OpenDisputeDto } from '../../modules/disputes/dto/dispute.dto';

export const QUOTE_TTL_SECONDS = 60;
const REDIS_QUOTE_PREFIX = 'fx:quote:';

/** Shape stored in Redis for quote validation */
interface RedisQuotePayload {
  userId: string;
  fromCurrency: string;
  toCurrency: string;
  fromAmount: number;
  netFromAmount: number;
  toAmount: number;
  effectiveRate: string;
  midRate: string;
  markupPct: string;
  feeAmount: number;
  jurisdiction: string | null;
  expiresAt: number;
}

export interface QuoteRequestDto {
  fromCurrency: string;
  toCurrency: string;
  fromAmount: number;     // minor units
  /** Loyalty tier so the fee calculator can apply discounts */
  tier?: LoyaltyTier;
  feeWaived?: boolean;
}

export interface ConvertRequestDto {
  quoteId: string;
}

export interface ConversionHistoryQuery {
  page?: number;
  limit?: number;
  fromCurrency?: string;
  toCurrency?: string;
}

@Injectable()
export class FxConversionService {
  private readonly logger = new Logger(FxConversionService.name);

  constructor(
    @InjectRepository(FxQuote)
    private readonly quoteRepo: Repository<FxQuote>,

    @InjectRepository(FxConversion)
    private readonly conversionRepo: Repository<FxConversion>,

    @InjectRedis()
    private readonly redis: Redis,

    private readonly feeCalc: FeeCalculatorService,
    private readonly disclosure: RegulatoryDisclosureService,
    private readonly dataSource: DataSource,
    private readonly rateProvider: RateProviderService,
    private readonly configService: ConfigService,
    private readonly disputesService: DisputesService,
    private readonly adminAuditService: AdminAuditService,
    @InjectRepository(WalletEntity)
    private readonly walletRepo: Repository<WalletEntity>,
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
  ) {}

  // ── Quote ──────────────────────────────────────────────────────────────────

  /**
   * GET /fx/convert/quote
   * Fetches the live mid-rate, calculates fees, stores the quote in Redis,
   * persists a PENDING row to the DB, and returns the full breakdown.
   */
  async createQuote(
    userId: string,
    dto: QuoteRequestDto,
    userCountry?: string | null,
  ): Promise<FxQuote & { ttlSeconds: number; regulatoryDisclosure: string }> {
    const { fromCurrency, toCurrency, fromAmount } = dto;

    this.validateCurrencyPair(fromCurrency, toCurrency);
    if (fromAmount <= 0) throw new BadRequestException('fromAmount must be positive');

    // Fetch live mid-rate (injected provider abstraction)
    const midRate = await this.fetchMidRate(fromCurrency, toCurrency);

    const breakdown = this.feeCalc.calculate(
      fromAmount,
      midRate,
      dto.tier ?? LoyaltyTier.BRONZE,
      dto.feeWaived ?? false,
    );

    const jurisdiction      = this.disclosure.extractJurisdiction({ country: userCountry });
    const regulatoryText    = this.disclosure.getDisclosure(jurisdiction);
    const expiresAt         = Date.now() + QUOTE_TTL_SECONDS * 1_000;

    // Persist quote row (status = PENDING)
    const quote = this.quoteRepo.create({
      userId,
      fromCurrency,
      toCurrency,
      fromAmount,
      midRate:             breakdown.midRate,
      markupPct:           breakdown.markupPct,
      effectiveRate:       breakdown.effectiveRate,
      feeAmount:           breakdown.feeAmount,
      netFromAmount:       breakdown.netFromAmount,
      toAmount:            breakdown.toAmount,
      expiresAt,
      jurisdiction,
      regulatoryDisclosure: regulatoryText,
      status:              QuoteStatus.PENDING,
    });
    const savedQuote = await this.quoteRepo.save(quote);

    // Store in Redis with TTL — Redis is the authoritative lock
    const redisPayload: RedisQuotePayload = {
      userId,
      fromCurrency,
      toCurrency,
      fromAmount,
      netFromAmount: breakdown.netFromAmount,
      toAmount:      breakdown.toAmount,
      effectiveRate: breakdown.effectiveRate,
      midRate:       breakdown.midRate,
      markupPct:     breakdown.markupPct,
      feeAmount:     breakdown.feeAmount,
      jurisdiction,
      expiresAt,
    };
    await this.redis.set(
      `${REDIS_QUOTE_PREFIX}${savedQuote.id}`,
      JSON.stringify(redisPayload),
      'EX',
      QUOTE_TTL_SECONDS,
    );

    this.logger.log(
      `Quote ${savedQuote.id} created: ${fromAmount} ${fromCurrency} → ${breakdown.toAmount} ${toCurrency}`,
    );

    return { ...savedQuote, ttlSeconds: QUOTE_TTL_SECONDS, regulatoryDisclosure: regulatoryText };
  }

  // ── Execute ────────────────────────────────────────────────────────────────

  /**
   * POST /fx/convert
   * Validates the quote against Redis, ensures rate integrity, then atomically
   * writes the FxConversion record and marks the quote EXECUTED.
   */
  async executeConversion(
    userId: string,
    dto: ConvertRequestDto,
  ): Promise<FxConversion> {
    const { quoteId } = dto;

    // ── 1. Validate quote in Redis ────────────────────────────────────────────
    const raw = await this.redis.get(`${REDIS_QUOTE_PREFIX}${quoteId}`);
    if (!raw) {
      // Attempt to give a better error by reading the DB row
      const dbQuote = await this.quoteRepo.findOne({ where: { id: quoteId } });
      if (dbQuote?.status === QuoteStatus.EXECUTED) {
        throw new ConflictException('This quote has already been used');
      }
      throw new GoneException('Quote has expired or does not exist');
    }

    const payload: RedisQuotePayload = JSON.parse(raw);

    // ── 2. Ownership check ────────────────────────────────────────────────────
    if (payload.userId !== userId) {
      throw new BadRequestException('Quote does not belong to this user');
    }

    // ── 3. Expiry double-check (Redis TTL is authoritative but adds safety) ──
    if (Date.now() > payload.expiresAt) {
      await this.redis.del(`${REDIS_QUOTE_PREFIX}${quoteId}`);
      throw new GoneException('Quote has expired');
    }

    // ── 4. Atomic write ────────────────────────────────────────────────────────
    const conversion = await this.dataSource.transaction(async (em) => {
      // Prevent duplicate conversions for the same quoteId (unique index guard)
      const existing = await em.getRepository(FxConversion).findOne({
        where: { quoteId },
      });
      if (existing) throw new ConflictException('Conversion already executed for this quote');

      const conv = em.getRepository(FxConversion).create({
        userId,
        quoteId,
        fromCurrency:   payload.fromCurrency,
        toCurrency:     payload.toCurrency,
        fromAmount:     payload.fromAmount,
        feeCharged:     payload.feeAmount,
        netFromAmount:  payload.netFromAmount,
        toAmount:       payload.toAmount,
        rateUsed:       payload.effectiveRate,   // MUST match quote exactly
        midRateAtQuote: payload.midRate,
        markupPct:      payload.markupPct,
        status:         ConversionStatus.COMPLETED,
        jurisdiction:   payload.jurisdiction,
      });
      await em.save(conv);

      // Mark DB quote as EXECUTED
      await em.getRepository(FxQuote).update(quoteId, {
        status:     QuoteStatus.EXECUTED,
        resolvedAt: new Date(),
      });

      return conv;
    });

    // ── 5. Invalidate Redis key (consume the lock) ────────────────────────────
    await this.redis.del(`${REDIS_QUOTE_PREFIX}${quoteId}`);

    this.logger.log(
      `Conversion ${conversion.id} executed: ${conversion.fromAmount} ` +
      `${conversion.fromCurrency} → ${conversion.toAmount} ${conversion.toCurrency} ` +
      `@ ${conversion.rateUsed} (quote ${quoteId})`,
    );

    return conversion;
  }

  // ── Fee info ───────────────────────────────────────────────────────────────

  /**
   * GET /fx/fees
   * Returns a full fee breakdown for a given pair and amount without
   * locking a quote (informational only).
   */
  async getFeeBreakdown(
    fromCurrency: string,
    toCurrency: string,
    fromAmount: number,
    tier: LoyaltyTier = LoyaltyTier.BRONZE,
  ) {
    this.validateCurrencyPair(fromCurrency, toCurrency);
    const midRate  = await this.fetchMidRate(fromCurrency, toCurrency);
    const breakdown = this.feeCalc.calculate(fromAmount, midRate, tier);
    return this.feeCalc.describeBreakdown(breakdown, fromCurrency, toCurrency);
  }

  // ── History ────────────────────────────────────────────────────────────────

  /**
   * GET /fx/convert/history
   * Returns paginated, most-recent-first conversion history for the user.
   */
  async getHistory(
    userId: string,
    query: ConversionHistoryQuery,
  ): Promise<{ data: FxConversion[]; total: number; page: number; limit: number }> {
    const page  = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));

    const qb = this.conversionRepo
      .createQueryBuilder('c')
      .where('c.userId = :userId', { userId })
      .orderBy('c.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.fromCurrency) {
      qb.andWhere('c.fromCurrency = :fc', { fc: query.fromCurrency.toUpperCase() });
    }
    if (query.toCurrency) {
      qb.andWhere('c.toCurrency = :tc', { tc: query.toCurrency.toUpperCase() });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  // ── Reversal & Disputes ──────────────────────────────────────────────────

  /**
   * POST /fx/convert/:id/reverse
   * Reverses a conversion within a 5-minute window.
   */
  async reverseConversion(
    userId: string,
    conversionId: string,
    reason: string,
    actorId?: string,
    actorType: ActorType = ActorType.USER,
  ): Promise<FxConversion> {
    const conversion = await this.conversionRepo.findOne({
      where: { id: conversionId },
    });

    if (!conversion) throw new NotFoundException('Conversion not found');
    if (conversion.userId !== userId && actorType !== ActorType.ADMIN) {
      throw new BadRequestException('Conversion does not belong to this user');
    }
    if (conversion.status === ConversionStatus.REVERSED) {
      throw new ConflictException('Conversion is already reversed');
    }

    const windowMinutes = this.configService.get<number>('fx.reversalWindowMinutes') || 5;
    const windowMs = windowMinutes * 60 * 1000;
    const elapsed = Date.now() - conversion.createdAt.getTime();

    if (elapsed > windowMs) {
      throw new ConflictException({
        message: 'Reversal window has passed. Please open a dispute instead.',
        disputeLink: `/fx/convert/${conversionId}/dispute`,
      });
    }

    return await this.dataSource.transaction(async (em) => {
      // Re-fetch with lock to prevent concurrent reversals
      const conv = await em.findOne(FxConversion, {
        where: { id: conversionId },
        lock: { mode: 'pessimistic_write' },
      });

      if (conv!.status === ConversionStatus.REVERSED) {
        throw new ConflictException('Conversion was just reversed by another process');
      }

      // 1. Mark as reversed
      conv!.status = ConversionStatus.REVERSED;
      conv!.reversedAt = new Date();
      conv!.reversalReason = reason;
      conv!.reversedBy = actorId || userId;
      await em.save(conv!);

      // 2. Fetch wallets
      const fromWallet = await em.findOne(WalletEntity, {
        where: { userId: conv!.userId, type: conv!.fromCurrency },
      });
      const toWallet = await em.findOne(WalletEntity, {
        where: { userId: conv!.userId, type: conv!.toCurrency },
      });

      if (!fromWallet || !toWallet) {
        throw new Error('Wallets not found for reversal');
      }

      // 3. Create compensating transactions
      // Leg 1: Credit back the original source amount (fromAmount)
      const creditTx = em.getRepository(TransactionEntity).create({
        userId: conv!.userId,
        walletId: fromWallet.id,
        amount: conv!.fromAmount,
        currency: conv!.fromCurrency,
        direction: TransactionDirection.CREDIT,
        status: TransactionStatus.SUCCESS,
        description: `Reversal of FX conversion ${conv!.id}: ${reason}`,
        metadata: { conversionId: conv!.id, type: 'FX_REVERSAL_CREDIT' },
      });
      await em.save(creditTx);

      // Leg 2: Debit back the received amount (toAmount)
      const debitTx = em.getRepository(TransactionEntity).create({
        userId: conv!.userId,
        walletId: toWallet.id,
        amount: conv!.toAmount,
        currency: conv!.toCurrency,
        direction: TransactionDirection.DEBIT,
        status: TransactionStatus.SUCCESS,
        description: `Reversal of FX conversion ${conv!.id}: ${reason}`,
        metadata: { conversionId: conv!.id, type: 'FX_REVERSAL_DEBIT' },
      });
      await em.save(debitTx);

      // 4. Audit Log
      await this.adminAuditService.logFinancialEvent(
        { actorId: actorId || userId, actorType },
        {
          userId: conv!.userId,
          action: 'TRANSACTION_REVERSED',
          entityId: conv!.id,
          entityType: 'FXConversion',
          amount: conv!.fromAmount,
          currency: conv!.fromCurrency,
          metadata: {
            reason,
            toAmount: conv!.toAmount,
            toCurrency: conv!.toCurrency,
            reversalTxIds: [creditTx.id, debitTx.id],
          },
        },
      );

      return conv!;
    });
  }

  /**
   * POST /fx/convert/:id/dispute
   * Opens a formal dispute for a conversion after the reversal window.
   */
  async openDispute(
    userId: string,
    conversionId: string,
    dto: OpenDisputeDto,
  ) {
    return this.disputesService.openFxConversionDispute(conversionId, userId, dto);
  }

  /**
   * GET /admin/fx/reversals
   * Admin-only: list all reversed conversions.
   */
  async getAllReversals(filters: { startDate?: string; endDate?: string }) {
    const qb = this.conversionRepo
      .createQueryBuilder('c')
      .where('c.status = :status', { status: ConversionStatus.REVERSED })
      .orderBy('c.reversedAt', 'DESC');

    if (filters.startDate) {
      qb.andWhere('c.reversedAt >= :start', { start: new Date(filters.startDate) });
    }
    if (filters.endDate) {
      qb.andWhere('c.reversedAt <= :end', { end: new Date(filters.endDate) });
    }

    return qb.getMany();
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Fetch mid-market rate from the rate provider service
   */
  private async fetchMidRate(from: string, to: string): Promise<number> {
    try {
      return await this.rateProvider.getMidRate(from, to);
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        // Pass through structured error from rate provider
        throw error;
      }
      
      this.logger.error(`Failed to fetch rate for ${from}/${to}: ${error.message}`);
      throw new ServiceUnavailableException('Rate fetching service temporarily unavailable');
    }
  }

  private validateCurrencyPair(from: string, to: string): void {
    if (from.length !== 3 || to.length !== 3) {
      throw new BadRequestException('Currency codes must be ISO-4217 (3 characters)');
    }
    if (from.toUpperCase() === to.toUpperCase()) {
      throw new BadRequestException('Source and target currency must differ');
    }
  }
}
