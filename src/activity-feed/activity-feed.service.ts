import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindManyOptions, Repository } from 'typeorm';
import { ActivityEvent } from './activity-event.entity';

export interface ActivityFeedItem {
  timestamp: string;
  type: string;
  description: string;
  ipAddress: string | null;
  deviceInfo: string | null;
  securityEvent: boolean;
}

export interface ActivityFeedPage {
  items: ActivityFeedItem[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface RecordActivityInput {
  userId: string;
  type: string;
  description: string;
  ipAddress?: string | null;
  deviceInfo?: string | null;
  securityEvent?: boolean;
  metadata?: Record<string, unknown> | null;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

@Injectable()
export class ActivityFeedService {
  constructor(
    @InjectRepository(ActivityEvent)
    private readonly activityEventRepository: Repository<ActivityEvent>,
  ) {}

  async recordActivity(input: RecordActivityInput): Promise<ActivityEvent> {
    const activityEvent = this.activityEventRepository.create({
      userId: input.userId,
      type: input.type,
      description: input.description,
      ipAddress: input.ipAddress ?? null,
      deviceInfo: input.deviceInfo ?? null,
      securityEvent: input.securityEvent ?? false,
      metadata: input.metadata ?? null,
    });

    return this.activityEventRepository.save(activityEvent);
  }

  async getActivityForUser(
    userId: string,
    page = 1,
    limit = DEFAULT_PAGE_SIZE,
  ): Promise<ActivityFeedPage> {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(Math.max(1, limit), MAX_PAGE_SIZE);
    const options: FindManyOptions<ActivityEvent> = {
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    };

    const [events, total] =
      await this.activityEventRepository.findAndCount(options);

    return {
      items: events.map((event) => this.toFeedItem(event)),
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  private toFeedItem(event: ActivityEvent): ActivityFeedItem {
    return {
      timestamp: event.createdAt.toISOString(),
      type: event.type,
      description: event.description,
      ipAddress: event.ipAddress,
      deviceInfo: event.deviceInfo,
      securityEvent: event.securityEvent,
    };
  }
}
