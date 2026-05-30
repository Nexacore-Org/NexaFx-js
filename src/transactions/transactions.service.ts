import {
  Injectable,
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Transaction, TransactionStatus } from './transaction.entity';
import { WalletsService } from '../wallet/wallets.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { UsersService } from '../users/users.service';

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
  page?: number;
  limit?: number;
}

export interface ReverseTransactionDto {
  reason: string;
}

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
    private readonly dataSource: DataSource,
    private readonly walletsService: WalletsService,
    private readonly auditService: AuditService,
    private readonly mailService: MailService,
    private readonly usersService: UsersService,
    private readonly events: EventEmitter2,
  ) {}

  async transfer(dto: TransferDto): Promise<Transaction> {
    if (dto.amount <= 0) {
      throw new BadRequestException('Transfer amount must be positive');
    }
    if (dto.senderId === dto.receiverId) {
      throw new BadRequestException('Sender and receiver must differ');
    }

    const senderBalance = this.walletsService.getBalance(
      dto.senderId,
      dto.currency,
    );
    if (senderBalance.balance < dto.amount) {
      throw new BadRequestException('Insufficient balance');
    }

    return this.dataSource.transaction(async (manager) => {
      const tx = manager.create(Transaction, {
        ...dto,
        status: TransactionStatus.PENDING,
      });
      await manager.save(Transaction, tx);

      this.walletsService.adjustBalance(
        dto.senderId,
        dto.currency,
        -dto.amount,
      );
      this.walletsService.adjustBalance(
        dto.receiverId,
        dto.currency,
        dto.amount,
      );

      tx.status = TransactionStatus.COMPLETED;
      tx.completedAt = new Date();
      const saved = await manager.save(Transaction, tx);
      this.events.emit('transactions.completed', {
        transactionId: saved.id,
        senderId: saved.senderId,
        receiverId: saved.receiverId,
        amount: saved.amount,
        currency: saved.currency,
        reference: saved.reference,
      });
      return saved;
    });
  }

  async findHistory(filters: TransactionFilters): Promise<{
    items: Transaction[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { userId, status, currency, page = 1, limit = 20 } = filters;

    const qb = this.txRepo
      .createQueryBuilder('tx')
      .orderBy('tx.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

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

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }

  async findById(id: string): Promise<Transaction> {
    const tx = await this.txRepo.findOne({ where: { id } });
    if (!tx) throw new NotFoundException(`Transaction ${id} not found`);
    return tx;
  }

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
      this.walletsService.adjustBalance(
        transaction.senderId,
        transaction.currency,
        Number(transaction.amount),
      );
      this.walletsService.adjustBalance(
        transaction.receiverId,
        transaction.currency,
        -Number(transaction.amount),
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
