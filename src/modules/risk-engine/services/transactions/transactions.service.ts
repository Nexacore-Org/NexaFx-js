/**
 * PATCH — Add EventEmitter2 injection and emit TRADE_COMPLETED_EVENT
 * after a trade is finalized. Merge with your existing TransactionsService.
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Trade } from './entities/trade.entity';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import {
  TRADE_COMPLETED_EVENT,
  TradeCompletedPayload,
} from '../risk-engine/jobs/risk-refresh.job';

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(
    @InjectRepository(Trade)
    private readonly tradeRepository: Repository<Trade>,
    private readonly eventEmitter: EventEmitter2, // <── inject
  ) {}

  async create(userId: string, dto: CreateTransactionDto): Promise<Trade> {
    // --- your existing trade creation logic here ---
    const trade = this.tradeRepository.create({
      userId,
      ...dto,
      status: 'OPEN',
    });
    const saved = await this.tradeRepository.save(trade);
    return saved;
  }

  /**
   * Call this method when a trade reaches terminal state (COMPLETED / CLOSED).
   * It persists the result and fires the risk refresh event.
   */
  async completeTrade(tradeId: string, pnl: number): Promise<Trade> {
    const trade = await this.tradeRepository.findOneOrFail({
      where: { id: tradeId },
    });

    trade.pnl = pnl;
    trade.status = 'COMPLETED';
    trade.completedAt = new Date();

    const saved = await this.tradeRepository.save(trade);

    // ── Emit event → RiskRefreshJob.handleTradeCompleted() ──────────────────
    const payload: TradeCompletedPayload = {
      tradeId: saved.id,
      userId: saved.userId,
      pnl,
    };

    this.eventEmitter.emit(TRADE_COMPLETED_EVENT, payload);
    this.logger.log(
      `Emitted ${TRADE_COMPLETED_EVENT} for trade ${tradeId}, user ${saved.userId}`,
    );

    return saved;
  }
}