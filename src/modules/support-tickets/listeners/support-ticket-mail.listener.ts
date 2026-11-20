import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { MailService } from '../../../mail/mail.service';
import { UsersService } from '../../../users/users.service';
import {
  SupportTicketCreatedEvent,
  SupportTicketEvents,
  SupportTicketStatusChangedEvent,
} from '../support-ticket.events';

@Injectable()
export class SupportTicketMailListener {
  constructor(
    private readonly usersService: UsersService,
    private readonly mail: MailService,
  ) {}

  @OnEvent(SupportTicketEvents.CREATED)
  async handleCreated(payload: SupportTicketCreatedEvent): Promise<void> {
    const user = await this.usersService.findByIdOrNull(payload.userId);
    if (!user) return;
    this.mail.sendSupportTicketCreatedEmail({
      to: user.email,
      fullName: `${user.firstName} ${user.lastName}`.trim(),
      ticketId: payload.ticketId,
      subject: payload.subject,
      category: payload.priority,
    });
  }

  @OnEvent(SupportTicketEvents.STATUS_CHANGED)
  async handleStatusChanged(
    payload: SupportTicketStatusChangedEvent,
  ): Promise<void> {
    const user = await this.usersService.findByIdOrNull(payload.userId);
    if (!user) return;
    this.mail.sendSupportTicketStatusUpdateEmail({
      to: user.email,
      fullName: `${user.firstName} ${user.lastName}`.trim(),
      ticketId: payload.ticketId,
      status: payload.to,
    });
  }
}
