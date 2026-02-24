import { Injectable, Logger } from '@nestjs/common';
import { Server } from 'socket.io';
import {
  NOTIFICATION_CHANNELS,
  NotificationEvent,
  NOTIFICATION_EVENTS,
} from './notifications.constants';
import {
  NotificationPayload,
  NotificationsPersistenceService,
} from './notifications-persistence.service';

export interface NotificationEnvelope {
  id: string;
  event: NotificationEvent;
  payload: Record<string, unknown>;
  timestamp: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private server: Server;

  constructor(
    private readonly persistence: NotificationsPersistenceService,
  ) {}

  /** Called by the gateway after server init */
  setServer(server: Server): void {
    this.server = server;
  }

  // ─── User-targeted emission ───────────────────────────────────────────────

  async emitToUser(
    userId: string,
    event: NotificationEvent,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const persisted = await this.persistence.persist({ event, payload, userId });
    const envelope: NotificationEnvelope = {
      id: persisted.id,
      event,
      payload,
      timestamp: persisted.createdAt.toISOString(),
    };
    const channel = NOTIFICATION_CHANNELS.USER(userId);
    const room = this.server?.to(channel);

    if (room) {
      room.emit(event, envelope);
      await this.persistence.markDelivered([persisted.id]);
      this.logger.debug(`Emitted ${event} to ${channel}`);
    } else {
      this.logger.debug(`User ${userId} offline — event persisted (id=${persisted.id})`);
    }
  }

  // ─── Admin broadcast ──────────────────────────────────────────────────────

  async emitToAdmins(
    event: NotificationEvent,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const persisted = await this.persistence.persist({ event, payload });
    const envelope: NotificationEnvelope = {
      id: persisted.id,
      event,
      payload,
      timestamp: persisted.createdAt.toISOString(),
    };
    const channel = NOTIFICATION_CHANNELS.ADMIN();
    this.server?.to(channel).emit(event, envelope);
    this.logger.debug(`Emitted admin event ${event}`);
  }

  // ─── Transaction events ───────────────────────────────────────────────────

  async emitTransactionUpdate(
    userId: string,
    transactionId: string,
    status: string,
    meta: Record<string, unknown> = {},
  ): Promise<void> {
    const event = this.resolveTransactionEvent(status);
    const payload = { transactionId, status, ...meta };
    await this.emitToUser(userId, event, payload);
    // Also broadcast on transaction-specific room for watchers
    this.server
      ?.to(NOTIFICATION_CHANNELS.TRANSACTION(transactionId))
      .emit(event, { id: 'broadcast', event, payload, timestamp: new Date().toISOString() });
  }

  async emitApprovalUpdate(
    userId: string,
    approvalId: string,
    status: string,
    meta: Record<string, unknown> = {},
  ): Promise<void> {
    const eventMap: Record<string, NotificationEvent> = {
      requested: NOTIFICATION_EVENTS.APPROVAL_REQUESTED,
      granted: NOTIFICATION_EVENTS.APPROVAL_GRANTED,
      rejected: NOTIFICATION_EVENTS.APPROVAL_REJECTED,
      expired: NOTIFICATION_EVENTS.APPROVAL_EXPIRED,
      threshold_met: NOTIFICATION_EVENTS.APPROVAL_THRESHOLD_MET,
    };
    const event = eventMap[status] ?? NOTIFICATION_EVENTS.APPROVAL_REQUESTED;
    await this.emitToUser(userId, event, { approvalId, status, ...meta });
    // Notify admins too
    await this.emitToAdmins(event, { approvalId, userId, status, ...meta });
  }

  async emitFraudAlert(
    userId: string,
    alertId: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    meta: Record<string, unknown> = {},
  ): Promise<void> {
    const payload = { alertId, userId, severity, ...meta };
    // Notify the affected user
    await this.emitToUser(userId, NOTIFICATION_EVENTS.FRAUD_ALERT, payload);
    // Notify fraud channel (admins)
    this.server
      ?.to(NOTIFICATION_CHANNELS.FRAUD())
      .emit(NOTIFICATION_EVENTS.FRAUD_ALERT, {
        id: alertId,
        event: NOTIFICATION_EVENTS.FRAUD_ALERT,
        payload,
        timestamp: new Date().toISOString(),
      });
    await this.emitToAdmins(NOTIFICATION_EVENTS.FRAUD_FLAG_RAISED, payload);
  }

  // ─── Missed-event recovery ────────────────────────────────────────────────

  async deliverMissedEvents(userId: string, since: Date, limit?: number): Promise<void> {
    const missed = await this.persistence.getMissedEvents(userId, since, limit);
    if (!missed.length) return;

    const channel = NOTIFICATION_CHANNELS.USER(userId);
    const envelopes = missed.map((n) => ({
      id: n.id,
      event: n.event as NotificationEvent,
      payload: n.payload,
      timestamp: n.createdAt.toISOString(),
    }));

    this.server?.to(channel).emit(NOTIFICATION_EVENTS.MISSED_EVENTS, envelopes);
    await this.persistence.markDelivered(missed.map((n) => n.id));
    this.logger.log(`Delivered ${missed.length} missed events to user ${userId}`);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private resolveTransactionEvent(status: string): NotificationEvent {
    const map: Record<string, NotificationEvent> = {
      created: NOTIFICATION_EVENTS.TRANSACTION_CREATED,
      pending: NOTIFICATION_EVENTS.TRANSACTION_PENDING,
      confirmed: NOTIFICATION_EVENTS.TRANSACTION_CONFIRMED,
      failed: NOTIFICATION_EVENTS.TRANSACTION_FAILED,
      reversed: NOTIFICATION_EVENTS.TRANSACTION_REVERSED,
    };
    return map[status] ?? NOTIFICATION_EVENTS.TRANSACTION_PENDING;
  }
}
