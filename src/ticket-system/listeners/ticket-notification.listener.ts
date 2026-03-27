import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { SupportTicket } from '../entities/support-ticket.entity';
import { NotificationsGateway } from '../../web-sockets/notifications.gateway';
import { NOTIFICATION_CHANNELS } from '../../web-sockets/notifications.constants';

export const TICKET_CREATED_EVENT = 'support.ticket.created';

export interface TicketCreatedPayload {
  ticket: SupportTicket;
}

/**
 * Sends notifications when support tickets are created:
 * - User receives an in-app WebSocket confirmation
 * - Admin support channel receives a WebSocket notification
 */
@Injectable()
export class TicketNotificationListener {
  private readonly logger = new Logger(TicketNotificationListener.name);

  constructor(private readonly gateway: NotificationsGateway) {}

  @OnEvent(TICKET_CREATED_EVENT)
  onTicketCreated(payload: TicketCreatedPayload): void {
    const { ticket } = payload;

    // Notify the user who created the ticket
    this.gateway.server?.to(NOTIFICATION_CHANNELS.USER(ticket.userId)).emit('support.ticket.created', {
      event: 'support.ticket.created',
      payload: {
        ticketId: ticket.id,
        subject: ticket.subject,
        status: ticket.status,
        priority: ticket.priority,
        slaDeadline: ticket.slaDeadline,
        createdAt: ticket.createdAt,
      },
      timestamp: new Date().toISOString(),
    });

    // Notify admin channel
    this.gateway.server?.to(NOTIFICATION_CHANNELS.ADMIN()).emit('support.ticket.new', {
      event: 'support.ticket.new',
      payload: {
        ticketId: ticket.id,
        userId: ticket.userId,
        subject: ticket.subject,
        priority: ticket.priority,
        slaDeadline: ticket.slaDeadline,
        createdAt: ticket.createdAt,
      },
      timestamp: new Date().toISOString(),
    });

    this.logger.debug(`Ticket notifications sent for ticket ${ticket.id} (user=${ticket.userId})`);
  }
}
