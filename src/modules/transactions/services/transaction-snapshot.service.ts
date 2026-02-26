import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { TransactionExecutionSnapshotEntity } from '../entities/transaction-execution-snapshot.entity';

export interface CreateSnapshotInput {
  transactionId: string;
  status: 'SUCCESS' | 'FAILED';
  durationMs?: number;
  metadata: Record<string, any>;
  logs?: Record<string, any>;
  errorMessage?: string;
  errorStack?: string;
  enrichmentMetadata?: Record<string, any>;
}

/**
 * Creates transaction execution snapshots for auditing and replay.
 * Typically invoked by event listeners after TRANSACTION_COMPLETED or TRANSACTION_FAILED.
 */
@Injectable()
export class TransactionSnapshotService {
  constructor(
    @InjectRepository(TransactionExecutionSnapshotEntity)
    private readonly snapshotRepo: Repository<TransactionExecutionSnapshotEntity>,
  ) {}

  async createSnapshot(input: CreateSnapshotInput): Promise<TransactionExecutionSnapshotEntity> {
    const entity = this.snapshotRepo.create({
      transactionId: input.transactionId,
      status: input.status,
      durationMs: input.durationMs,
      metadata: input.metadata,
      logs: input.logs,
      errorMessage: input.errorMessage,
      errorStack: input.errorStack,
      enrichmentMetadata: input.enrichmentMetadata,
    });
    return this.snapshotRepo.save(entity);
  }
}
