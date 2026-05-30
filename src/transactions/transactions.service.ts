import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Transaction, TransactionStatus } from './transaction.entity';
import { WalletsService } from '../wallet/wallets.service';

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

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
    private readonly dataSource: DataSource,
    private readonly walletsService: WalletsService,
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

      this.walletsService.adjustBalance(dto.senderId, dto.currency, -dto.amount);
      this.walletsService.adjustBalance(dto.receiverId, dto.currency, dto.amount);

      tx.status = TransactionStatus.COMPLETED;
      tx.completedAt = new Date();
      return manager.save(Transaction, tx);
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
}
