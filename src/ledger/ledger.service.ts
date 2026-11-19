import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { UsersService } from '../users/users.service';
import { LedgerEntry, LedgerEntryType } from './ledger-entry.entity';

export interface CreateLedgerEntryDto {
  userId: string;
  transactionId?: string;
  type: LedgerEntryType;
  amount: number;
  currency: string;
  balanceAfter: number;
  description?: string;
}

@Injectable()
export class LedgerService {
  constructor(
    @InjectRepository(LedgerEntry)
    private readonly ledgerRepo: Repository<LedgerEntry>,
    private readonly usersService: UsersService,
  ) {}

  async recordEntry(dto: CreateLedgerEntryDto, manager?: EntityManager): Promise<LedgerEntry> {
    // #1427: when the caller supplies a manager, write through it so the ledger
    // entry commits/rolls back with the caller's transaction — and skip the
    // extra users lookup while the wallet row is held under lock.
    if (manager) {
      const repo = manager.getRepository(LedgerEntry);
      const entry = repo.create({
        ...dto,
        transactionId: dto.transactionId ?? null,
        description: dto.description ?? null,
      });
      return repo.save(entry);
    }
    await this.usersService.findById(dto.userId);
    const entry = this.ledgerRepo.create({
      ...dto,
      transactionId: dto.transactionId ?? null,
      description: dto.description ?? null,
    });
    return this.ledgerRepo.save(entry);
  }

  async findByUser(
    userId: string,
    opts: { page?: number; limit?: number } = {},
  ): Promise<{ data: LedgerEntry[]; meta: { page: number; limit: number; total: number } }> {
    const page = Math.max(1, Number(opts.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(opts.limit) || 20));
    const [data, total] = await this.ledgerRepo.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, meta: { page, limit, total } };
  }

  async findById(id: string): Promise<LedgerEntry> {
    const entry = await this.ledgerRepo.findOne({ where: { id } });
    if (!entry) throw new NotFoundException(`Ledger entry ${id} not found`);
    return entry;
  }
}
