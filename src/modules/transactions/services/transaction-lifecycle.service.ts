import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { TransactionEntity } from '../entities/transaction.entity';
import {
  TRANSACTION_CREATED,
  TRANSACTION_PROCESSING,
  TRANSACTION_COMPLETED,
  TRANSACTION_FAILED,
} from '../events';
import type {
  TransactionCreatedPayload,
  TransactionProcessingPayload,
  TransactionCompletedPayload,
  TransactionFailedPayload,
} from '../events';

export interface CreateTransactionInput {
  amount: number;
  currency: string;
  description?: string;
  metadata?: Record<string, any>;
  payload?: Record<string, any>;
  externalId?: string;
}

/**
 * Runs transaction lifecycle in DB transactions and emits domain events
 * only after each transaction has committed. This keeps listeners from
 * seeing uncommitted data and preserves consistency.
 */
@Injectable()
export class TransactionLifecycleService {
  private readonly logger = new Logger(TransactionLifecycleService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
  ) {}

  /**
   * Create a new transaction record. Emits TRANSACTION_CREATED after commit.
   */
  async create(input: CreateTransactionInput): Promise<TransactionEntity> {
    let transaction: TransactionEntity;

    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(TransactionEntity);
      const entity = repo.create({
        amount: input.amount,
        currency: input.currency,
        status: 'PENDING',
        description: input.description,
        metadata: input.metadata,
        payload: input.payload,
        externalId: input.externalId,
      });
      transaction = await repo.save(entity);
    });

    this.eventEmitter.emit(TRANSACTION_CREATED, {
      transactionId: transaction!.id,
      timestamp: new Date(),
      amount: transaction!.amount,
      currency: transaction!.currency,
      metadata: transaction!.metadata,
      payload: transaction!.payload,
    } as TransactionCreatedPayload);

    return transaction!;
  }

  /**
   * Mark transaction as processing. Emits TRANSACTION_PROCESSING after commit.
   */
  async markProcessing(transactionId: string): Promise<TransactionEntity> {
    const startedAt = new Date();
    let transaction: TransactionEntity;

    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(TransactionEntity);
      const existing = await repo.findOne({ where: { id: transactionId } });
      if (!existing) throw new Error(`Transaction not found: ${transactionId}`);
      await repo.update(
        { id: transactionId },
        { status: 'PENDING', updatedAt: new Date() },
      );
      const updated = await repo.findOne({ where: { id: transactionId } });
      transaction = updated ?? existing;
    });

    this.eventEmitter.emit(TRANSACTION_PROCESSING, {
      transactionId,
      timestamp: new Date(),
      startedAt,
    } as TransactionProcessingPayload);

    return transaction!;
  }

  /**
   * Mark transaction as completed. Emits TRANSACTION_COMPLETED after commit.
   */
  async markCompleted(
    transactionId: string,
    options?: { durationMs?: number; metadata?: Record<string, any> },
  ): Promise<TransactionEntity> {
    const completedAt = new Date();
    let transaction: TransactionEntity | null = null;

    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(TransactionEntity);
      await repo.update(
        { id: transactionId },
        { status: 'SUCCESS', updatedAt: completedAt },
      );
      transaction = await repo.findOne({ where: { id: transactionId } });
    });
    if (!transaction) throw new Error(`Transaction not found: ${transactionId}`);

    this.eventEmitter.emit(TRANSACTION_COMPLETED, {
      transactionId,
      timestamp: new Date(),
      completedAt,
      durationMs: options?.durationMs,
      metadata: options?.metadata,
    } as TransactionCompletedPayload);

    return transaction;
  }

  /**
   * Mark transaction as failed. Emits TRANSACTION_FAILED after commit.
   */
  async markFailed(
    transactionId: string,
    error: { message: string; code?: string; retryable?: boolean; meta?: Record<string, any> },
  ): Promise<TransactionEntity> {
    const failedAt = new Date();
    let transaction: TransactionEntity | null = null;

    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(TransactionEntity);
      await repo.update(
        { id: transactionId },
        { status: 'FAILED', updatedAt: failedAt },
      );
      transaction = await repo.findOne({ where: { id: transactionId } });
    });
    if (!transaction) throw new Error(`Transaction not found: ${transactionId}`);

    this.eventEmitter.emit(TRANSACTION_FAILED, {
      transactionId,
      timestamp: new Date(),
      failedAt,
      errorMessage: error.message,
      errorCode: error.code,
      retryable: error.retryable,
      meta: error.meta,
    } as TransactionFailedPayload);

    return transaction;
  }
}
