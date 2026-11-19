import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { SupportTicketsService } from './support-tickets.service';

function build(ticket: Record<string, unknown> | null = {}) {
  const ticketRepo = {
    findOne: jest.fn().mockResolvedValue(ticket),
    save: jest.fn(async (value) => value),
  };
  const messageRepo = {};
  const usersService = { findByIdOrNull: jest.fn() };
  const service = new SupportTicketsService(
    ticketRepo as any,
    messageRepo as any,
    usersService as any,
  );
  return { service, ticketRepo, usersService };
}

describe('SupportTicketsService', () => {
  describe('assign', () => {
    it('assigns a ticket to an existing staff member', async () => {
      const { service, usersService, ticketRepo } = build({
        id: 't1',
        userId: 'owner',
        status: 'open',
      });
      usersService.findByIdOrNull.mockResolvedValue({ id: 'agent', role: 'admin' });

      await expect(service.assign('t1', 'agent')).resolves.toEqual(
        expect.objectContaining({ assignedTo: 'agent', status: 'in_progress' }),
      );
      expect(ticketRepo.save).toHaveBeenCalled();
    });

    it('refuses to assign to a customer account', async () => {
      const { service, usersService } = build({ id: 't1', userId: 'owner', status: 'open' });
      usersService.findByIdOrNull.mockResolvedValue({ id: 'customer', role: 'user' });

      await expect(service.assign('t1', 'customer')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('refuses to assign to a user that does not exist', async () => {
      const { service, usersService } = build({ id: 't1', userId: 'owner', status: 'open' });
      usersService.findByIdOrNull.mockResolvedValue(null);

      await expect(service.assign('t1', 'ghost')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an illegal status transition', async () => {
      const { service, usersService } = build({
        id: 't1',
        userId: 'owner',
        status: 'closed',
      });
      usersService.findByIdOrNull.mockResolvedValue({ id: 'agent', role: 'admin' });

      await expect(service.assign('t1', 'agent', 'resolved')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('sets resolvedAt when resolving and clears it when reopening', async () => {
      const { service, usersService } = build({
        id: 't1',
        userId: 'owner',
        status: 'in_progress',
      });
      usersService.findByIdOrNull.mockResolvedValue({ id: 'agent', role: 'admin' });

      const resolved = await service.assign('t1', 'agent', 'resolved');
      expect(resolved.resolvedAt).toBeInstanceOf(Date);

      const reopened = await service.assign('t1', 'agent', 'open');
      expect(reopened.resolvedAt).toBeUndefined();
    });

    it('404s for an unknown ticket', async () => {
      const { service } = build(null);
      await expect(service.assign('missing', 'agent')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('close', () => {
    it('lets the owner close their ticket', async () => {
      const { service } = build({ id: 't1', userId: 'owner', status: 'open' });
      await expect(service.close('t1', 'owner')).resolves.toEqual(
        expect.objectContaining({ status: 'closed' }),
      );
    });

    it('refuses to close another customer\'s ticket', async () => {
      const { service } = build({ id: 't1', userId: 'owner', status: 'open' });
      await expect(service.close('t1', 'someone-else')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('is idempotent for an already closed ticket', async () => {
      const { service, ticketRepo } = build({ id: 't1', userId: 'owner', status: 'closed' });
      await expect(service.close('t1', 'owner')).resolves.toEqual(
        expect.objectContaining({ status: 'closed' }),
      );
      expect(ticketRepo.save).not.toHaveBeenCalled();
    });
  });
});
