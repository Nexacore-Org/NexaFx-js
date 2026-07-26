import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionEntity } from '../transactions/entities/transaction.entity';
import { WalletEntity } from '../users/entities/wallet.entity';
import { TransactionsService } from '../transactions/services/transactions.service';
import { WalletService } from '../users/wallet.service';
import { ExportTransactionsDto, ExportBalancesDto } from '../dto/export.dto';

@Injectable()
export class ExportService {
  constructor(
    private readonly transactionsService: TransactionsService,
    private readonly walletService: WalletService,
  ) {}

  async exportTransactions(userId: string, dto: ExportTransactionsDto): Promise<any> {
    const result = await this.transactionsService.search(
      {
        page: 1,
        limit: 10000,
        from: dto.from,
        to: dto.to,
      },
      userId,
    );

    const data = result.data || [];

    if (dto.format === 'csv') {
      return this.convertToCsv(data, [
        'id', 'amount', 'currency', 'status', 'description', 'createdAt',
      ]);
    }

    return { success: true, data };
  }

  async exportBalances(userId: string, dto: ExportBalancesDto): Promise<any> {
    const wallets = await this.walletService.getWalletsByUser(userId);

    const data = wallets.map((w) => ({
      id: w.id,
      name: w.name,
      type: w.type,
      status: w.status,
      availableBalance: w.availableBalance,
      escrowBalance: w.escrowBalance,
      publicKey: w.publicKey,
      createdAt: w.createdAt,
    }));

    if (dto.format === 'csv') {
      return this.convertToCsv(data, [
        'id', 'name', 'type', 'status', 'availableBalance', 'escrowBalance', 'publicKey', 'createdAt',
      ]);
    }

    return { success: true, data };
  }

  private convertToCsv(data: any[], columns: string[]): string {
    const header = columns.join(',');
    const rows = data.map((row) =>
      columns
        .map((col) => {
          const val = row[col];
          if (val === null || val === undefined) return '';
          const str = String(val);
          return str.includes(',') || str.includes('"') || str.includes('\n')
            ? `"${str.replace(/"/g, '""')}"`
            : str;
        })
        .join(','),
    );
    return [header, ...rows].join('\n');
  }
}
