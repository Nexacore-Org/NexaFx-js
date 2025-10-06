import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
// Assume a 'Transaction' entity exists
import { Transaction } from '../../transactions/entities/transaction.entity';

@Injectable()
export class AnalyticsService {
  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
  ) {}

  async getUserSummary(userId: string): Promise<any> {
    const cacheKey = `user:${userId}:summary`;
    const cachedData = await this.cacheManager.get(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    // Example aggregation queries
    const totalSentQuery = this.transactionRepository
      .createQueryBuilder('tx')
      .select('SUM(tx.amount)', 'total')
      .where('tx.senderId = :userId', { userId });

    const totalReceivedQuery = this.transactionRepository
      .createQueryBuilder('tx')
      .select('SUM(tx.amount)', 'total')
      .where('tx.recipientId = :userId', { userId });
      
    const [sent, received] = await Promise.all([
        totalSentQuery.getRawOne(),
        totalReceivedQuery.getRawOne(),
    ]);

    const summary = {
      totalSent: parseFloat(sent.total) || 0,
      totalReceived: parseFloat(received.total) || 0,
      // Add more complex queries for balance trends, etc.
    };

    // Cache the result for 5 minutes
    await this.cacheManager.set(cacheKey, summary, 300);
    return summary;
  }
  
  // Placeholder for admin platform-wide metrics
  async getPlatformMetrics(): Promise<any> {
     // Similar logic as above, but without userId filters and with more complex aggregations
     const totalVolume = await this.transactionRepository.createQueryBuilder('tx').select('SUM(tx.amount)', 'total').getRawOne();
     const userCount = 1000; // In a real app, query the User entity

     return {
         totalTransactionVolume: parseFloat(totalVolume.total) || 0,
         totalUsers: userCount,
         // ... more metrics
     };
  }
}