import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  MAX_MESSAGES_PER_TICKET,
  SupportTicketsService,
} from './support-tickets.service';
import { TicketStatus } from '../entities/support-ticket.entity';
import {
  LegacySupportTicketEvents,
  SupportTicketEvents,
} from '../support-ticket.events';

function build(
  ticket: unknown = { id: 't1', userId: 'owner', status: TicketStatus.OPEN },
) {
  const ticketRepo = {
    findOne: jest.fn().mockResolvedValue(ticket),
    save: jest.fn((value: unknown): Promise<unknown> => Promise.resolve(value)),
    create: jest.fn((value: unknown): unknown => value),
  };
  const messageRepo = {
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn((value: unknown): unknown => value),
    save: jest.fn((value: unknown): Promise<unknown> => Promise.resolve(value)),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
  };
  const usersService = { findByIdOrNull: jest.fn() };
  const events = { emit: jest.fn() };
  const service = new SupportTicketsService(
    ticketRepo as never,
    messageRepo as never,
    usersService as never,
    events as never,
  );
  return { service, ticketRepo, messageRepo, usersService, events };
}

describe('SupportTicketsService', () => {
  describe('create', () => {
    it('emits created and legacy cache events', async () => {
      const { service, events } = build();
      await service.create('owner', {
        subject: 'Help',
        description: 'Details',
      });

      expect(events.emit).toHaveBeenCalledWith(
        SupportTicketEvents.CREATED,
        expect.objectContaining({ userId: 'owner', subject: 'Help' }),
      );
      expect(events.emit).toHaveBeenCalledWith(
        LegacySupportTicketEvents.CREATED,
        expect.any(Object),
      );
    });
  });

  describe('assign', () => {
    it('assigns a ticket to an existing staff member', async () => {
      const { service, usersService, ticketRepo } = build();
      usersService.findByIdOrNull.mockResolvedValue({
        id: 'agent',
        role: 'admin',
      });

      await expect(service.assign('t1', 'agent')).resolves.toEqual(
        expect.objectContaining({
          assignedTo: 'agent',
          status: TicketStatus.IN_PROGRESS,
        }),
      );
      expect(ticketRepo.save).toHaveBeenCalled();
    });

    it('allows compliance staff as assignees', async () => {
      const { service, usersService } = build();
      usersService.findByIdOrNull.mockResolvedValue({
        id: 'agent',
        role: 'compliance',
      });

      await expect(service.assign('t1', 'agent')).resolves.toEqual(
        expect.objectContaining({ assignedTo: 'agent' }),
      );
    });

    it('refuses to assign to a customer account', async () => {
      const { service, usersService } = build();
      usersService.findByIdOrNull.mockResolvedValue({
        id: 'customer',
        role: 'user',
      });

      await expect(service.assign('t1', 'customer')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('refuses to assign to a user that does not exist', async () => {
      const { service, usersService } = build();
      usersService.findByIdOrNull.mockResolvedValue(null);

      await expect(service.assign('t1', 'ghost')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects an illegal status transition', async () => {
      const { service, usersService } = build({
        id: 't1',
        userId: 'owner',
        status: TicketStatus.CLOSED,
      });
      usersService.findByIdOrNull.mockResolvedValue({
        id: 'agent',
        role: 'admin',
      });

      await expect(
        service.assign('t1', 'agent', TicketStatus.RESOLVED),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses to reassign a closed ticket', async () => {
      const { service, usersService } = build({
        id: 't1',
        userId: 'owner',
        status: TicketStatus.CLOSED,
      });
      usersService.findByIdOrNull.mockResolvedValue({
        id: 'agent',
        role: 'admin',
      });

      await expect(service.assign('t1', 'agent')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('sets resolvedAt when resolving and emits both event names', async () => {
      const { service, usersService, events } = build({
        id: 't1',
        userId: 'owner',
        status: TicketStatus.IN_PROGRESS,
      });
      usersService.findByIdOrNull.mockResolvedValue({
        id: 'agent',
        role: 'admin',
      });

      const resolved = await service.assign(
        't1',
        'agent',
        TicketStatus.RESOLVED,
      );
      expect(resolved.resolvedAt).toBeInstanceOf(Date);
      expect(events.emit).toHaveBeenCalledWith(
        SupportTicketEvents.ASSIGNED,
        expect.objectContaining({ assignedTo: 'agent' }),
      );
      expect(events.emit).toHaveBeenCalledWith(
        SupportTicketEvents.STATUS_CHANGED,
        expect.objectContaining({ to: TicketStatus.RESOLVED }),
      );
      expect(events.emit).toHaveBeenCalledWith(
        LegacySupportTicketEvents.UPDATED,
        expect.any(Object),
      );
    });

    it('404s for an unknown ticket', async () => {
      const { service } = build(null);
      await expect(service.assign('missing', 'agent')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('changeStatus', () => {
    it('changes status through the state machine and emits events', async () => {
      const { service, events } = build();
      const result = await service.changeStatus(
        't1',
        TicketStatus.RESOLVED,
        'agent',
      );

      expect(result.status).toBe(TicketStatus.RESOLVED);
      expect(result.resolvedAt).toBeInstanceOf(Date);
      expect(events.emit).toHaveBeenCalledWith(
        SupportTicketEvents.STATUS_CHANGED,
        expect.objectContaining({
          ticketId: 't1',
          from: TicketStatus.OPEN,
          to: TicketStatus.RESOLVED,
          actorId: 'agent',
        }),
      );
      expect(events.emit).toHaveBeenCalledWith(
        LegacySupportTicketEvents.UPDATED,
        expect.any(Object),
      );
    });

    it('rejects an invalid transition and unknown tickets', async () => {
      const { service } = build({
        id: 't1',
        userId: 'owner',
        status: TicketStatus.CLOSED,
      });
      await expect(
        service.changeStatus('t1', TicketStatus.OPEN, 'agent'),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        build(null).service.changeStatus('missing', TicketStatus.OPEN, 'agent'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('reopen', () => {
    it('reopens a recently closed ticket', async () => {
      const { service, events } = build({
        id: 't1',
        userId: 'owner',
        status: TicketStatus.CLOSED,
        createdAt: new Date(),
        resolvedAt: new Date(),
      });

      await expect(service.reopen('t1', 'agent')).resolves.toEqual(
        expect.objectContaining({
          status: TicketStatus.OPEN,
          resolvedAt: undefined,
        }),
      );
      expect(events.emit).toHaveBeenCalledWith(
        SupportTicketEvents.STATUS_CHANGED,
        expect.objectContaining({
          from: TicketStatus.CLOSED,
          to: TicketStatus.OPEN,
          actorId: 'agent',
        }),
      );
    });

    it('refuses to reopen outside the window or when not closed', async () => {
      const old = build({
        id: 't1',
        userId: 'owner',
        status: TicketStatus.CLOSED,
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      });
      await expect(old.service.reopen('t1')).rejects.toBeInstanceOf(
        BadRequestException,
      );

      const open = build();
      await expect(open.service.reopen('t1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('close', () => {
    it('lets the owner close their ticket and makes it terminal', async () => {
      const { service } = build();
      await expect(service.close('t1', 'owner')).resolves.toEqual(
        expect.objectContaining({ status: TicketStatus.CLOSED }),
      );
      await expect(
        service.changeStatus('t1', TicketStatus.OPEN),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuses to close another customer's ticket", async () => {
      const { service } = build();
      await expect(service.close('t1', 'someone-else')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('is idempotent for an already closed ticket', async () => {
      const { service, ticketRepo } = build({
        id: 't1',
        userId: 'owner',
        status: TicketStatus.CLOSED,
      });
      await expect(service.close('t1', 'owner')).resolves.toEqual(
        expect.objectContaining({ status: TicketStatus.CLOSED }),
      );
      expect(ticketRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('messages', () => {
    it('lets the owner add a message', async () => {
      const { service, messageRepo } = build();
      await expect(
        service.addMessage('t1', 'owner', '  hello  '),
      ).resolves.toEqual(expect.objectContaining({ message: 'hello' }));
      expect(messageRepo.create).toHaveBeenCalledWith({
        ticketId: 't1',
        senderId: 'owner',
        message: 'hello',
      });
    });

    it('lets the assignee add a message', async () => {
      const { service } = build({
        id: 't1',
        userId: 'owner',
        assignedTo: 'agent',
        status: TicketStatus.IN_PROGRESS,
      });
      await expect(service.addMessage('t1', 'agent', 'hello')).resolves.toEqual(
        expect.objectContaining({ senderId: 'agent' }),
      );
    });

    it('rejects a stranger with 403 and a missing ticket with 404', async () => {
      const { service } = build();
      await expect(
        service.addMessage('t1', 'stranger', 'hello'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.getMessages('t1', 'stranger'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      const missing = build(null);
      await expect(
        missing.service.getMessages('missing', 'owner'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects oversized and blank messages', async () => {
      const { service, messageRepo } = build();
      await expect(
        service.addMessage('t1', 'owner', 'a'.repeat(5001)),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.addMessage('t1', 'owner', '   '),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(messageRepo.save).not.toHaveBeenCalled();
    });

    it('enforces the per-ticket message cap', async () => {
      const { service, messageRepo } = build();
      messageRepo.count.mockResolvedValue(MAX_MESSAGES_PER_TICKET);
      await expect(service.addMessage('t1', 'owner', 'hello')).rejects.toThrow(
        'message limit',
      );
    });

    it('paginates messages for the owner', async () => {
      const { service, messageRepo } = build();
      messageRepo.findAndCount.mockResolvedValue([[{ id: 'm51' }], 120]);

      const result = await service.getMessages('t1', 'owner', {
        page: 2,
        limit: 50,
      });

      expect(messageRepo.findAndCount).toHaveBeenCalledWith({
        where: { ticketId: 't1' },
        order: { createdAt: 'ASC' },
        skip: 50,
        take: 50,
      });
      expect(result).toEqual({
        data: [{ id: 'm51' }],
        total: 120,
        page: 2,
        limit: 50,
      });
    });

    it('paginates messages for the assignee with defaults', async () => {
      const { service, messageRepo } = build({
        id: 't1',
        userId: 'owner',
        assignedTo: 'agent',
        status: TicketStatus.IN_PROGRESS,
      });
      await service.getMessages('t1', 'agent');

      expect(messageRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 50 }),
      );
    });
  });
});
