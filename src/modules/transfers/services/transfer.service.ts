import { Injectable, Logger, BadRequestException, UnprocessableEntityException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { TransferEntity, TransferStatus } from '../entities/transfer.entity';
import { WalletEntity } from '../../users/entities/wallet.entity';
import { TransactionEntity } from '../../transactions/entities/transaction.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { P2PTransferDto, TransferReversalDto } from '../dto/p2p-transfer.dto';
import { NotificationOrchestratorService } from '../../notifications/services/notification-orchestrator.service';
import { TransactionLifecycleService } from '../../transactions/services/transaction-lifecycle.service';
import { WalletBalanceService } from '../../wallets/services/wallet-balance.service';

@Injectable()
export class TransferService {
  private readonly logger = new Logger(TransferService.name);

  constructor(
    @InjectRepository(TransferEntity)
    private readonly transferRepo: Repository<TransferEntity>,
    @InjectRepository(WalletEntity)
    private readonly walletRepo: Repository<WalletEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(TransactionEntity)
    private readonly transactionRepo: Repository<TransactionEntity>,
    private readonly dataSource: DataSource,
    private readonly notificationService: NotificationOrchestratorService,
    private readonly transactionLifecycle: TransactionLifecycleService,
    private readonly walletBalanceService: WalletBalanceService,
  ) {}

  async createP2PTransfer(senderId: string, dto: P2PTransferDto): Promise<TransferEntity> {
    // Prevent self-transfer
    if (dto.recipientId === senderId) {
      throw new BadRequestException('Cannot transfer to yourself');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('SERIALIZABLE');

    try {
      // Get sender and recipient wallets with FOR UPDATE lock
      const senderWallet = await this.getUserWallet(senderId, dto.senderWalletId, queryRunner);
      const recipient = await this.getRecipient(dto.recipientId, queryRunner);
      const recipientWallet = await this.getUserWallet(recipient.id, undefined, queryRunner);

      // Check available balance
      const currentBalance = senderWallet.availableBalance;
      if (currentBalance < dto.amount) {
        throw new UnprocessableEntityException({
          message: 'Insufficient balance',
          availableBalance: currentBalance,
        });
      }

      // Create transfer record
      const transfer = await queryRunner.manager.save(TransferEntity, {
        senderId,
        recipientId: recipient.id,
        senderWalletId: senderWallet.id,
        recipientWalletId: recipientWallet.id,
        amount: dto.amount,
        currency: dto.currency || 'USD',
        description: dto.description,
        status: TransferStatus.PENDING,
        reversibleUntil: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
        fee: this.calculateFee(dto.amount),
      });

      // Perform atomic balance updates
      await this.updateBalances(queryRunner, senderWallet, recipientWallet, dto.amount, dto.fee || 0);

      // Create transaction records
      const senderTx = await this.createDebitTransaction(queryRunner, transfer, senderWallet);
      const recipientTx = await this.createCreditTransaction(queryRunner, transfer, recipientWallet);

      // Update transfer with transaction IDs
      transfer.senderTransactionId = senderTx.id;
      transfer.recipientTransactionId = recipientTx.id;
      transfer.status = TransferStatus.COMPLETED;
      transfer.completedAt = new Date();
      await queryRunner.manager.save(TransferEntity, transfer);

      // Commit transaction
      await queryRunner.commitTransaction();

      // Invalidate balance caches
      await this.walletBalanceService.invalidateCache(senderWallet.id);
      await this.walletBalanceService.invalidateCache(recipientWallet.id);

      // Send notifications after commit
      await this.sendTransferNotifications(transfer, senderId, recipient.id);

      this.logger.log(`P2P transfer completed: ${transfer.id} - ${dto.amount} ${dto.currency} from ${senderId} to ${recipient.id}`);
      return transfer;

    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`P2P transfer failed: ${error.message}`, error.stack);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async reverseTransfer(transferId: string, userId: string, dto: TransferReversalDto): Promise<TransferEntity> {
    const transfer = await this.transferRepo.findOne({ where: { id: transferId } });
    if (!transfer) {
      throw new NotFoundException('Transfer not found');
    }

    // Check if transfer can be reversed
    if (transfer.status !== TransferStatus.COMPLETED) {
      throw new BadRequestException('Only completed transfers can be reversed');
    }

    if (transfer.senderId !== userId) {
      throw new BadRequestException('Only sender can reverse transfer');
    }

    if (new Date() > transfer.reversibleUntil) {
      throw new BadRequestException('Transfer reversal window has expired');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('SERIALIZABLE');

    try {
      // Get wallets with FOR UPDATE lock
      const senderWallet = await queryRunner.manager.findOne(WalletEntity, {
        where: { id: transfer.senderWalletId },
        lock: { mode: 'pessimistic_write' },
      });
      const recipientWallet = await queryRunner.manager.findOne(WalletEntity, {
        where: { id: transfer.recipientWalletId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!senderWallet || !recipientWallet) {
        throw new NotFoundException('Wallet not found');
      }

      // Reverse balances
      senderWallet.availableBalance += transfer.amount + transfer.fee;
      recipientWallet.availableBalance -= transfer.amount;

      await queryRunner.manager.save([senderWallet, recipientWallet]);

      // Create reversal transactions
      const reversalFee = this.calculateReversalFee(transfer.amount);
      const senderReversalTx = await this.createCreditTransaction(queryRunner, transfer, senderWallet, 'REVERSAL');
      const recipientReversalTx = await this.createDebitTransaction(queryRunner, transfer, recipientWallet, 'REVERSAL');

      // Update transfer status
      transfer.status = TransferStatus.REVERSED;
      transfer.reversalReason = dto.reason;
      transfer.reversedBy = userId;
      transfer.reversedAt = new Date();
      await queryRunner.manager.save(TransferEntity, transfer);

      await queryRunner.commitTransaction();

      // Invalidate caches
      await this.walletBalanceService.invalidateCache(senderWallet.id);
      await this.walletBalanceService.invalidateCache(recipientWallet.id);

      // Send reversal notifications
      await this.sendReversalNotifications(transfer, userId);

      this.logger.log(`Transfer reversed: ${transferId}`);
      return transfer;

    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Transfer reversal failed: ${error.message}`, error.stack);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async getTransfer(transferId: string, userId: string): Promise<TransferEntity> {
    const transfer = await this.transferRepo.findOne({ where: { id: transferId } });
    if (!transfer) {
      throw new NotFoundException('Transfer not found');
    }

    // Only allow sender or recipient to view transfer
    if (transfer.senderId !== userId && transfer.recipientId !== userId) {
      throw new BadRequestException('Access denied');
    }

    return transfer;
  }

  async getUserTransfers(userId: string, page = 1, limit = 20): Promise<{ transfers: TransferEntity[]; total: number }> {
    const [transfers, total] = await this.transferRepo.findAndCount({
      where: [{ senderId: userId }, { recipientId: userId }],
      order: { createdAt: 'DESC' },
      take: limit,
      skip: (page - 1) * limit,
    });

    return { transfers, total };
  }

  private async getUserWallet(userId: string, walletId?: string, queryRunner?: any): Promise<WalletEntity> {
    const repo = queryRunner?.manager || this.walletRepo;
    
    if (walletId) {
      const wallet = await repo.findOne(WalletEntity, {
        where: { id: walletId, userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!wallet) {
        throw new NotFoundException('Wallet not found');
      }
      return wallet;
    }

    // Get default wallet
    const wallet = await repo.findOne(WalletEntity, {
      where: { userId, status: 'active' },
      order: { createdAt: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    });
    if (!wallet) {
      throw new NotFoundException('No active wallet found');
    }
    return wallet;
  }

  private async getRecipient(recipientId: string, queryRunner?: any): Promise<UserEntity> {
    const repo = queryRunner?.manager || this.userRepo;
    
    // Try to find as user first
    let recipient = await repo.findOne(UserEntity, { where: { id: recipientId } });
    
    if (!recipient) {
      // Try to find as wallet
      const wallet = await this.walletRepo.findOne({ where: { id: recipientId } });
      if (wallet) {
        recipient = await repo.findOne(UserEntity, { where: { id: wallet.userId } });
      }
    }

    if (!recipient) {
      throw new NotFoundException('Recipient not found');
    }

    return recipient;
  }

  private async updateBalances(
    queryRunner: any,
    senderWallet: WalletEntity,
    recipientWallet: WalletEntity,
    amount: number,
    fee: number
  ): Promise<void> {
    // Atomic balance updates
    senderWallet.availableBalance -= (amount + fee);
    recipientWallet.availableBalance += amount;

    await queryRunner.manager.save([senderWallet, recipientWallet]);
  }

  private async createDebitTransaction(
    queryRunner: any,
    transfer: TransferEntity,
    wallet: WalletEntity,
    type = 'TRANSFER'
  ): Promise<TransactionEntity> {
    const transaction = await queryRunner.manager.save(TransactionEntity, {
      amount: transfer.amount,
      currency: transfer.currency,
      status: 'SUCCESS',
      description: transfer.description || `P2P ${type} to ${transfer.recipientId}`,
      walletId: wallet.id,
      fromAddress: wallet.publicKey,
      toAddress: transfer.recipientWalletId,
      metadata: {
        type: 'DEBIT',
        transferId: transfer.id,
        transferType: type,
        recipientId: transfer.recipientId,
      },
    });

    return transaction;
  }

  private async createCreditTransaction(
    queryRunner: any,
    transfer: TransferEntity,
    wallet: WalletEntity,
    type = 'TRANSFER'
  ): Promise<TransactionEntity> {
    const transaction = await queryRunner.manager.save(TransactionEntity, {
      amount: transfer.amount,
      currency: transfer.currency,
      status: 'SUCCESS',
      description: transfer.description || `P2P ${type} from ${transfer.senderId}`,
      walletId: wallet.id,
      fromAddress: transfer.senderWalletId,
      toAddress: wallet.publicKey,
      metadata: {
        type: 'CREDIT',
        transferId: transfer.id,
        transferType: type,
        senderId: transfer.senderId,
      },
    });

    return transaction;
  }

  private calculateFee(amount: number): number {
    // Simple fee calculation: 0.5% minimum $0.50, maximum $10
    const fee = Math.max(amount * 0.005, 0.50);
    return Math.min(fee, 10);
  }

  private calculateReversalFee(amount: number): number {
    // Reversal fee: 1% minimum $1, maximum $20
    const fee = Math.max(amount * 0.01, 1);
    return Math.min(fee, 20);
  }

  private async sendTransferNotifications(transfer: TransferEntity, senderId: string, recipientId: string): Promise<void> {
    // Send notification to sender
    await this.notificationService.notify({
      userId: senderId,
      type: 'transfer.sent',
      title: 'Transfer Sent',
      body: `You sent ${transfer.amount} ${transfer.currency} to ${transfer.recipientId}`,
      urgency: 'normal',
      payload: {
        transferId: transfer.id,
        amount: transfer.amount,
        currency: transfer.currency,
        recipientId: transfer.recipientId,
      },
    }).catch(err => this.logger.error(`Failed to send sender notification: ${err.message}`));

    // Send notification to recipient
    await this.notificationService.notify({
      userId: recipientId,
      type: 'transfer.received',
      title: 'Transfer Received',
      body: `You received ${transfer.amount} ${transfer.currency} from ${transfer.senderId}`,
      urgency: 'normal',
      payload: {
        transferId: transfer.id,
        amount: transfer.amount,
        currency: transfer.currency,
        senderId: transfer.senderId,
      },
    }).catch(err => this.logger.error(`Failed to send recipient notification: ${err.message}`));
  }

  private async sendReversalNotifications(transfer: TransferEntity, reversedBy: string): Promise<void> {
    // Send reversal notification to sender
    await this.notificationService.notify({
      userId: transfer.senderId,
      type: 'transfer.reversed',
      title: 'Transfer Reversed',
      body: `Your transfer of ${transfer.amount} ${transfer.currency} has been reversed`,
      urgency: 'high',
      payload: {
        transferId: transfer.id,
        amount: transfer.amount,
        currency: transfer.currency,
        reason: transfer.reversalReason,
      },
    }).catch(err => this.logger.error(`Failed to send reversal notification: ${err.message}`));

    // Send reversal notification to recipient
    await this.notificationService.notify({
      userId: transfer.recipientId,
      type: 'transfer.reversed_received',
      title: 'Transfer Reversed',
      body: `A transfer of ${transfer.amount} ${transfer.currency} has been reversed`,
      urgency: 'high',
      payload: {
        transferId: transfer.id,
        amount: transfer.amount,
        currency: transfer.currency,
        reason: transfer.reversalReason,
      },
    }).catch(err => this.logger.error(`Failed to send recipient reversal notification: ${err.message}`));
  }
}
