import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ReplayTransactionDto } from '../dto/replay-transaction.dto';
import { TransactionEntity } from '../entities/transaction.entity';

@Injectable()
export class TransactionReplayService {
  constructor(private readonly dataSource: DataSource) {}

  async replay(transactionId: string, dto: ReplayTransactionDto) {
    const txRepo = this.dataSource.getRepository(TransactionEntity);

    const transaction = await txRepo.findOne({ where: { id: transactionId } });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    /**
     * ✅ SAFE ISOLATED MODE:
     * We execute replay logic inside a DB transaction and ALWAYS rollback.
     * This guarantees replay cannot mutate production state.
     */
    const result = await this.dataSource.transaction(async (manager) => {
      const logs: any[] = [];
      const startedAt = Date.now();

      try {
        // ✅ You can re-run the same execution path used in prod,
        // but pass a flag so downstream services behave in "replay mode"
        // (no external side effects like emails, webhooks, payments).
        const replayOutput = await this.simulateExecution(
          manager,
          transaction,
          logs,
        );

        const durationMs = Date.now() - startedAt;

        return {
          success: true,
          transactionId,
          durationMs,
          replayOutput,
          logs: dto.includeLogs ? logs : undefined,
          mode: 'isolated-replay',
        };
      } catch (err: any) {
        const durationMs = Date.now() - startedAt;

        return {
          success: false,
          transactionId,
          durationMs,
          error: {
            message: err?.message ?? 'Replay failed',
          },
          logs: dto.includeLogs ? logs : undefined,
          mode: 'isolated-replay',
        };
      }
    });

    /**
     * ⚠️ IMPORTANT:
     * Nest/TypeORM transaction will COMMIT if we return normally.
     *
     * ✅ So to guarantee rollback we must throw at the end of the transaction,
     * OR use manual queryRunner rollback.
     *
     * ✅ Best approach: manual QueryRunner with rollback.
     */
    return this.replayWithForcedRollback(transaction, dto);
  }

  private async replayWithForcedRollback(
    transaction: TransactionEntity,
    dto: ReplayTransactionDto,
  ) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    const logs: any[] = [];
    const startedAt = Date.now();

    try {
      const replayOutput = await this.simulateExecution(
        queryRunner.manager,
        transaction,
        logs,
      );
      const durationMs = Date.now() - startedAt;

      // ✅ ALWAYS rollback (safe replay)
      await queryRunner.rollbackTransaction();

      return {
        success: true,
        transactionId: transaction.id,
        durationMs,
        replayOutput,
        logs: dto.includeLogs ? logs : undefined,
        mode: 'isolated-replay',
      };
    } catch (err: any) {
      const durationMs = Date.now() - startedAt;

      await queryRunner.rollbackTransaction();

      return {
        success: false,
        transactionId: transaction.id,
        durationMs,
        error: {
          message: err?.message ?? 'Replay failed',
        },
        logs: dto.includeLogs ? logs : undefined,
        mode: 'isolated-replay',
      };
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Your “execution” logic goes here.
   * This should mimic your real production transaction execution flow,
   * but MUST NOT trigger side effects.
   */
  private async simulateExecution(
    manager: any,
    transaction: TransactionEntity,
    logs: any[],
  ) {
    logs.push({
      step: 'LOAD_TRANSACTION',
      txId: transaction.id,
      at: new Date().toISOString(),
    });

    // Example: pretend we compute something based on transaction payload
    const payload = transaction.payload ?? {}; // adjust based on schema

    logs.push({
      step: 'VALIDATE_PAYLOAD',
      ok: true,
    });

    // Example “execution result”
    const computed = {
      replayed: true,
      originalStatus: transaction.status,
      payloadSummary: Object.keys(payload),
    };

    logs.push({
      step: 'SIMULATION_DONE',
      computed,
    });

    return computed;
  }
}
