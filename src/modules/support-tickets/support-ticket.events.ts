import { CacheEvents } from '../cache/cache-keys';

export const SupportTicketEvents = {
  CREATED: 'support-ticket.created',
  ASSIGNED: 'support-ticket.assigned',
  STATUS_CHANGED: 'support-ticket.status-changed',
} as const;

export const LegacySupportTicketEvents = {
  CREATED: CacheEvents.SUPPORT_TICKET_CREATED,
  UPDATED: CacheEvents.SUPPORT_TICKET_UPDATED,
} as const;

export interface SupportTicketCreatedEvent {
  ticketId: string;
  userId: string;
  subject: string;
  priority: string;
}

export interface SupportTicketAssignedEvent {
  ticketId: string;
  assignedTo: string;
  actorId?: string;
}

export interface SupportTicketStatusChangedEvent {
  ticketId: string;
  userId: string;
  from: string;
  to: string;
  actorId?: string;
}
