import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { Cache } from 'cache-manager';

@Injectable()
export class AdminCacheInvalidationService {
  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  @OnEvent('transactions.completed')
  @OnEvent('transactions.reversed')
  @OnEvent('kyc.reviewed')
  @OnEvent('aml.alert.created')
  @OnEvent('support.ticket.created')
  @OnEvent('support.ticket.updated')
  async invalidateStats(): Promise<void> {
    await this.cache.del('admin-stats');
  }
}
