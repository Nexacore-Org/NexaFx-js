import { Injectable, Inject, Logger } from '@nestjs/common';
import Redis from 'ioredis';

export interface SecurityEvent {
  id: string;
  type: string;
  ip: string;
  userId?: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: Date;
  metadata?: Record<string, any>;
}

@Injectable()
export class SecurityEventsService {
  private readonly logger = new Logger(SecurityEventsService.name);
  private readonly EVENTS_KEY = 'security:events';
  private readonly MAX_EVENTS = 10000;

  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async logEvent(
    event: Omit<SecurityEvent, 'id' | 'timestamp'>,
  ): Promise<void> {
    try {
      const securityEvent: SecurityEvent = {
        ...event,
        id: this.generateEventId(),
        timestamp: new Date(),
      };

      await this.redis.lpush(this.EVENTS_KEY, JSON.stringify(securityEvent));
      await this.redis.ltrim(this.EVENTS_KEY, 0, this.MAX_EVENTS - 1);

      if (
        securityEvent.severity === 'high' ||
        securityEvent.severity === 'critical'
      ) {
        this.logger.warn(
          `Security event: ${securityEvent.type} - ${securityEvent.description}`,
        );
      }
    } catch (err) {
      this.logger.error('Error logging security event:', err);
    }
  }

  async getEvents(
    limit: number = 100,
    offset: number = 0,
    filter?: Partial<Pick<SecurityEvent, 'type' | 'severity' | 'userId'>>,
  ): Promise<SecurityEvent[]> {
    try {
      const events = await this.redis.lrange(
        this.EVENTS_KEY,
        offset,
        offset + limit - 1,
      );

      let parsedEvents = events.map((e) => JSON.parse(e) as SecurityEvent);

      if (filter) {
        parsedEvents = parsedEvents.filter((event) => {
          if (filter.type && event.type !== filter.type) return false;
          if (filter.severity && event.severity !== filter.severity)
            return false;
          if (filter.userId && event.userId !== filter.userId) return false;
          return true;
        });
      }

      return parsedEvents;
    } catch (err) {
      this.logger.error('Error getting security events:', err);
      return [];
    }
  }

  async getEventsByIP(
    ip: string,
    limit: number = 50,
  ): Promise<SecurityEvent[]> {
    try {
      const allEvents = await this.redis.lrange(this.EVENTS_KEY, 0, 1000);
      const parsedEvents = allEvents
        .map((e) => JSON.parse(e) as SecurityEvent)
        .filter((event) => event.ip === ip)
        .slice(0, limit);

      return parsedEvents;
    } catch (err) {
      this.logger.error(`Error getting events for IP ${ip}:`, err);
      return [];
    }
  }

  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
