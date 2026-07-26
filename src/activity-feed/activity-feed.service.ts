import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindManyOptions, Between, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import { ActivityFeedItem, ActivityType } from './activity-feed-item.entity';

export interface CreateActivityInput {
  userId: string;
  type: ActivityType;
  title: string;
  description: string;
  metadata?: Record<string, unknown> | null;
}

export interface ActivityFeedFilters {
  type?: ActivityType;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface ActivityFeedPage {
  items: ActivityFeedItem[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

@Injectable()
export class ActivityFeedService {
  constructor(
    @InjectRepository(ActivityFeedItem)
    private readonly repo: Repository<ActivityFeedItem>,
  ) {}

  async recordActivity(input: CreateActivityInput): Promise<ActivityFeedItem> {
    const item = this.repo.create({
      userId: input.userId,
      type: input.type,
      title: input.title,
      description: input.description,
      metadata: input.metadata ?? null,
    });
    return this.repo.save(item);
  }

  async findAll(
    userId: string,
    filters: ActivityFeedFilters = {},
  ): Promise<ActivityFeedPage> {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(Math.max(1, filters.limit ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);

    const where: Record<string, unknown> = { userId };

    if (filters.type) {
      where.type = filters.type;
    }

    if (filters.startDate || filters.endDate) {
      const start = filters.startDate ? new Date(filters.startDate) : new Date(0);
      const end = filters.endDate ? new Date(filters.endDate) : new Date();
      where.createdAt = Between(start, end);
    }

    const options: FindManyOptions<ActivityFeedItem> = {
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    };

    const [items, total] = await this.repo.findAndCount(options);

    return {
      items,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  async markAsRead(userId: string, id: string): Promise<ActivityFeedItem> {
    const item = await this.repo.findOne({ where: { id, userId } });
    if (!item) {
      throw new NotFoundException(`Activity item ${id} not found`);
    }
    item.isRead = true;
    return this.repo.save(item);
  }

  async markAllAsRead(userId: string): Promise<void> {
    await this.repo.update(
      { userId, isRead: false },
      { isRead: true },
    );
  }

  @OnEvent('transactions.completed')
  async handleTransactionCompleted(payload: {
    transactionId: string;
    senderId: string;
    receiverId: string;
    amount: number;
    currency: string;
    reference: string;
  }): Promise<void> {
    await this.recordActivity({
      userId: payload.senderId,
      type: ActivityType.TRANSACTION,
      title: 'Transaction Completed',
      description: `Transfer of ${payload.amount} ${payload.currency} completed`,
      metadata: {
        transactionId: payload.transactionId,
        counterpartyId: payload.receiverId,
        amount: payload.amount,
        currency: payload.currency,
        reference: payload.reference,
      },
    });
  }

  @OnEvent('transactions.deposit.completed')
  async handleDepositCompleted(payload: {
    transactionId: string;
    userId: string;
  }): Promise<void> {
    await this.recordActivity({
      userId: payload.userId,
      type: ActivityType.WALLET,
      title: 'Deposit Completed',
      description: 'A deposit has been credited to your wallet',
      metadata: { transactionId: payload.transactionId },
    });
  }

  @OnEvent('transactions.withdrawal.completed')
  async handleWithdrawalCompleted(payload: {
    transactionId: string;
    userId: string;
  }): Promise<void> {
    await this.recordActivity({
      userId: payload.userId,
      type: ActivityType.WALLET,
      title: 'Withdrawal Completed',
      description: 'A withdrawal has been processed from your wallet',
      metadata: { transactionId: payload.transactionId },
    });
  }

  @OnEvent('kyc.submitted')
  async handleKycSubmitted(payload: { userId: string; documentType?: string }): Promise<void> {
    await this.recordActivity({
      userId: payload.userId,
      type: ActivityType.KYC,
      title: 'KYC Submitted',
      description: 'Your identity verification documents have been submitted',
      metadata: { documentType: payload.documentType },
    });
  }

  @OnEvent('auth.login')
  async handleLogin(payload: { userId: string; ipAddress?: string }): Promise<void> {
    await this.recordActivity({
      userId: payload.userId,
      type: ActivityType.LOGIN,
      title: 'Login',
      description: 'Successful login to your account',
      metadata: { ipAddress: payload.ipAddress },
    });
  }

  @OnEvent('user.profile_updated')
  async handleProfileUpdated(payload: { userId: string; fields?: string[] }): Promise<void> {
    await this.recordActivity({
      userId: payload.userId,
      type: ActivityType.PROFILE_UPDATE,
      title: 'Profile Updated',
      description: 'Your profile information has been updated',
      metadata: { fields: payload.fields },
    });
  }
}
