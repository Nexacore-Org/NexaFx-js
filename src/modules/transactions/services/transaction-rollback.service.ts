import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionEntity } from '../entities/transaction.entity';
import { TransactionRollbackEntity } from '../entities/transaction-rollback.entity';
import { RollbackTransactionDto } from '../dto/rollback-transaction.dto';

@Injectable()
export class TransactionRollbackService {
  private readonly logger = new Logger(TransactionRollbackService.name);

  constructor(
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
    @InjectRepository(TransactionRollbackEntity)
    private readonly rollbackRepo: Repository<TransactionRollbackEntity>,
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
    const originalTx = await this.txRepo.findOne({
      where: { id: transactionId },
    });

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

    const alreadyRolledBack = await this.rollbackRepo.findOne({
      where: { originalTransactionId: transactionId },
    });

    if (alreadyRolledBack) {
      throw new BadRequestException(
        `Transaction ${transactionId} has already been rolled back`,
      );
    }

    const rollbackTx = this.txRepo.create({
      amount: -originalTx.amount,
      currency: originalTx.currency,
      status: 'SUCCESS',
      description: `Rollback of transaction ${transactionId}${dto.reason ? `: ${dto.reason}` : ''}`,
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

    const savedRollbackTx = await this.txRepo.save(rollbackTx);

    const rollbackRecord = this.rollbackRepo.create({
      originalTransactionId: transactionId,
      rollbackTransactionId: savedRollbackTx.id,
      reason: dto.reason,
      rolledBackBy: adminUserId,
    });

    const savedRollbackRecord = await this.rollbackRepo.save(rollbackRecord);

    this.logger.log(
      `Transaction ${transactionId} rolled back by admin ${adminUserId}. Rollback tx: ${savedRollbackTx.id}`,
    );

    return {
      success: true,
      originalTransaction: originalTx,
      rollbackTransaction: savedRollbackTx,
      rollbackRecord: savedRollbackRecord,
    };
  }
}
