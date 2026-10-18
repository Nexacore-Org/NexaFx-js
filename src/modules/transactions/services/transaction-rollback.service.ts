import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import Big from 'big.js';
import { TransactionEntity } from '../entities/transaction.entity';
import { TransactionRollbackEntity } from '../entities/transaction-rollback.entity';
import { RollbackTransactionDto } from '../dto/rollback-transaction.dto';
import { WalletsService } from '../../../wallet/wallets.service';

@Injectable()
export class TransactionRollbackService {
  private readonly logger = new Logger(TransactionRollbackService.name);

  constructor(
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
    @InjectRepository(TransactionRollbackEntity)
    private readonly rollbackRepo: Repository<TransactionRollbackEntity>,
    private readonly dataSource: DataSource,
    private readonly walletsService: WalletsService,
  ) {}

  async rollback(
    transactionId: string,
    dto: RollbackTransactionDto,
    adminUserId: string,
  ): Promise<{
    success: boolean;
    originalTransaction: TransactionEntity;
    rollbackTransaction: TransactionEntity;
    rollbackRecord: TransactionRollbackEntity;
  }> {
    return this.dataSource.transaction(async (manager) => {
      const originalTx = await manager
        .getRepository(TransactionEntity)
        .createQueryBuilder('t')
        .setLock('pessimistic_write')
        .where('t.id = :transactionId', { transactionId })
        .getOne();

      if (!originalTx) {
        throw new NotFoundException(
          `Transaction with ID ${transactionId} not found`,
        );
      }

      if (originalTx.status !== 'SUCCESS') {
        throw new BadRequestException(
          `Only completed transactions can be rolled back. Current status: ${originalTx.status}`,
        );
      }

      const alreadyRolledBack = await manager
        .getRepository(TransactionRollbackEntity)
        .findOne({
          where: { originalTransactionId: transactionId },
        });

      if (alreadyRolledBack) {
        throw new BadRequestException(
          `Transaction ${transactionId} has already been rolled back`,
        );
      }

      // The entity has no explicit type/direction field, so the rule is:
      // apply the OPPOSITE of the original amount's sign. A positive original
      // (credit-style) is debited from the wallet; a negative original
      // (debit-style) is credited back.
      const walletDelta = new Big(originalTx.amount).times(-1);
      if (originalTx.walletId) {
        await this.walletsService.adjustBalance(
          originalTx.walletId,
          originalTx.currency,
          Number(walletDelta.toString()),
          manager,
        );
      }

      // Store the rollback row with a POSITIVE amount. There is no
      // type/direction column on the entity, so we keep a 'REVERSAL:'
      // description prefix to mark the row and swap addresses to mirror the
      // original flow.
      const rollbackTx = manager.getRepository(TransactionEntity).create({
        amount: Number(new Big(originalTx.amount).abs().toString()),
        currency: originalTx.currency,
        status: 'SUCCESS',
        description: `REVERSAL: Rollback of transaction ${transactionId}${dto.reason ? `: ${dto.reason}` : ''}`,
        metadata: {
          ...originalTx.metadata,
          rollbackReason: dto.reason,
          originalTransactionId: transactionId,
        },
        walletId: originalTx.walletId,
        toAddress: originalTx.fromAddress,
        fromAddress: originalTx.toAddress,
        rollbackOf: transactionId,
      });

      const savedRollbackTx = await manager
        .getRepository(TransactionEntity)
        .save(rollbackTx);

      const rollbackRecord = manager
        .getRepository(TransactionRollbackEntity)
        .create({
          originalTransactionId: transactionId,
          rollbackTransactionId: savedRollbackTx.id,
          reason: dto.reason,
          rolledBackBy: adminUserId,
        });

      const savedRollbackRecord = await manager
        .getRepository(TransactionRollbackEntity)
        .save(rollbackRecord);

      // There is no rolledBackAt/settle field on TransactionEntity; the
      // unique transaction_rollbacks row (originalTransactionId), checked
      // above under the pessimistic lock, is the durable "rolled back" marker.
      this.logger.log(
        `Transaction ${transactionId} rolled back by admin ${adminUserId}. Rollback tx: ${savedRollbackTx.id}`,
      );

      return {
        success: true,
        originalTransaction: originalTx,
        rollbackTransaction: savedRollbackTx,
        rollbackRecord: savedRollbackRecord,
      };
    });
  }
}
