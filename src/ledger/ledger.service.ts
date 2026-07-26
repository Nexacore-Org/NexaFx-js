import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

  async recordEntry(dto: CreateLedgerEntryDto): Promise<LedgerEntry> {
    await this.usersService.findById(dto.userId);
    const entry = this.ledgerRepo.create({
      ...dto,
      transactionId: dto.transactionId ?? null,
      description: dto.description ?? null,
    });
    return this.ledgerRepo.save(entry);
  }

  async findByUser(userId: string): Promise<LedgerEntry[]> {
    await this.usersService.findById(userId);
    return this.ledgerRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async findById(id: string): Promise<LedgerEntry> {
    const entry = await this.ledgerRepo.findOne({ where: { id } });
    if (!entry) throw new NotFoundException(`Ledger entry ${id} not found`);
    return entry;
  }
}
