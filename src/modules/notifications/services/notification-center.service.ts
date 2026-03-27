import { Injectable, Logger } from '@nestjs/common';
import { Server } from 'socket.io';
import { NotificationPersistenceService, CreateNotificationInput } from './notification-persistence.service';

/**
 * NotificationCenterService persists a notification AND emits it via WebSocket.
 * The WS emission happens only after successful DB persist.
 */
@Injectable()
export class NotificationCenterService {
  private readonly logger = new Logger(NotificationCenterService.name);
  private server: Server | null = null;

  constructor(
    private readonly persistenceService: NotificationPersistenceService,
  ) {}

  setServer(server: Server): void {
    this.server = server;
  }

  async send(input: CreateNotificationInput): Promise<void> {
    // Persist first — emit only after successful save
    const notification = await this.persistenceService.create(input);

    const unreadCount = await this.persistenceService.getUnreadCount(input.userId);
    const channel = `user:${input.userId}`;

    if (this.server) {
      this.server.to(channel).emit('notification.new', {
        notification,
        timestamp: new Date().toISOString(),
      });

      this.server.to(channel).emit('notification.badgeCount', {
        unreadCount,
        timestamp: new Date().toISOString(),
      });
    } else {
      this.logger.debug(`WS server not ready — notification persisted only (id=${notification.id})`);
    }
  }

  async emitBadgeCount(userId: string, unreadCount: number): Promise<void> {
    if (!this.server) return;
    const channel = `user:${userId}`;
    this.server.to(channel).emit('notification.badgeCount', {
      unreadCount,
      timestamp: new Date().toISOString(),
    });
  }
}
