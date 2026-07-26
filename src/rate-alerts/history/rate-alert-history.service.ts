import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RateAlertHistory } from './rate-alert-history.entity';

@Injectable()
export class RateAlertHistoryService {
  constructor(
    @InjectRepository(RateAlertHistory)
    private readonly historyRepo: Repository<RateAlertHistory>,
  ) {}

  async recordAlert(params: {
    alertId: string;
    userId: string;
    currencyPair: string;
    triggeredRate: number;
    targetRate: number;
    direction: string;
  }): Promise<RateAlertHistory> {
    const entry = this.historyRepo.create(params);
    return this.historyRepo.save(entry);
  }

  async findByUserId(
    userId: string,
    page = 1,
    limit = 20,
  ): Promise<{
    items: RateAlertHistory[];
    total: number;
    page: number;
    limit: number;
  }> {
    const [items, total] = await this.historyRepo.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total, page, limit };
  }
}
