import { Injectable, Logger } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';

@Injectable()
export class StellarXdrService {
  private logger = new Logger(StellarXdrService.name);

  constructor(
    @InjectRepository('Transaction')
    private transactionRepo: Repository<any>,
    private schedulerRegistry: SchedulerRegistry,
  ) {
    this.scheduleXdrCleanup();
  }

  async storeXdr(transactionId: string, xdr: string): Promise<void> {
    const encoded = Buffer.from(xdr).toString('base64');
    await this.transactionRepo.update(transactionId, { stellarXdr: encoded });
  }

  async getXdr(transactionId: string, userId: string): Promise<string | null> {
    const transaction = await this.transactionRepo.findOne(transactionId);
    if (transaction?.userId !== userId) throw new Error('Unauthorized');
    if (!transaction?.stellarXdr) return null;
    return Buffer.from(transaction.stellarXdr, 'base64').toString();
  }

  private scheduleXdrCleanup(): void {
    const interval = setInterval(async () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      await this.transactionRepo.update(
        { createdAt: LessThan(thirtyDaysAgo) },
        { stellarXdr: null },
      );
      this.logger.log('XDR cleanup completed');
    }, 24 * 60 * 60 * 1000);
  }
}
