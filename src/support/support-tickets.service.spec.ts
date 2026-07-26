import { EventEmitter2 } from '@nestjs/event-emitter';
import { MailService } from '../mail/mail.service';
import { UsersService } from '../users/users.service';
import { SupportTicketsService } from './support-tickets.service';
import {
  SupportTicket,
  SupportTicketCategory,
  SupportTicketStatus,
} from './support-ticket.entity';

describe('SupportTicketsService', () => {
  const create = jest.fn();
  const save = jest.fn();
  const find = jest.fn();
  const findOne = jest.fn();
  const repository = { create, save, find, findOne };
  const sendSupportTicketCreatedEmail = jest.fn();
  const sendSupportTicketStatusUpdateEmail = jest.fn();
  const emit = jest.fn();
  const usersService = {
    findById: jest.fn(),
  } as unknown as UsersService;
  const mailService = {
    sendSupportTicketCreatedEmail,
    sendSupportTicketStatusUpdateEmail,
  } as unknown as MailService;
  const events = {
    emit,
  } as unknown as EventEmitter2;
  const service = new SupportTicketsService(
    repository as never,
    usersService,
    mailService,
    events,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a ticket and sends a confirmation email', async () => {
    const ticket = {
      id: 'ticket-1',
      userId: 'user-1',
      subject: 'Need help',
      description: 'Account issue',
      category: SupportTicketCategory.ACCOUNT,
      status: SupportTicketStatus.OPEN,
    } as SupportTicket;

    create.mockReturnValue(ticket);
    save.mockResolvedValue(ticket);
    (usersService.findById as jest.Mock).mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
    });

    await expect(
      service.createTicket({
        userId: 'user-1',
        subject: 'Need help',
        description: 'Account issue',
        category: SupportTicketCategory.ACCOUNT,
      }),
    ).resolves.toBe(ticket);

    expect(sendSupportTicketCreatedEmail).toHaveBeenCalledWith(
      expect.objectContaining({ ticketId: 'ticket-1' }),
    );
    expect(emit).toHaveBeenCalledWith('support.ticket.created', ticket);
  });

  it('lists all tickets for admins', async () => {
    find.mockResolvedValue([]);

    await expect(service.listTickets('admin-1', true)).resolves.toEqual([]);
    expect(find).toHaveBeenCalledWith({
      order: { createdAt: 'DESC' },
    });
  });
});
