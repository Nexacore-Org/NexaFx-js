import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SupportTicketsController } from './support-tickets.controller';
import { AdminSupportTicketsController } from './admin-support-tickets.controller';
import { SupportTicketsService } from '../services/support-tickets.service';
import { CreateTicketMessageDto } from '../dto/create-ticket-message.dto';
import { ROLES_KEY } from '../../../auth/decorators/roles.decorator';
import { Role } from '../../../auth/enums/role.enum';
import { TicketStatus } from '../entities/support-ticket.entity';

const make = () => {
  const service = {
    create: jest.fn(),
    findAll: jest.fn(),
    findAllForStaff: jest.fn(),
    findOne: jest.fn(),
    assign: jest.fn(),
    close: jest.fn(),
    addMessage: jest.fn(),
    getMessages: jest.fn(),
    changeStatus: jest.fn(),
    reopen: jest.fn(),
  };
  return {
    service,
    controller: new SupportTicketsController(
      service as unknown as SupportTicketsService,
    ),
    admin: new AdminSupportTicketsController(
      service as unknown as SupportTicketsService,
    ),
  };
};

const request = { user: { id: 'user-1', sub: 'user-1' } };

describe('SupportTicketsController', () => {
  beforeEach(() => jest.clearAllMocks());

  it('forwards the caller id when creating and listing tickets', async () => {
    const { controller, service } = make();
    const dto = { subject: 'Help', description: 'Details' };
    await controller.create(request, dto);
    expect(service.create).toHaveBeenCalledWith('user-1', dto);

    await controller.findAll(request, {});
    expect(service.findAll).toHaveBeenCalledWith('user-1', {});
    await controller.findOne('t1', request);
    expect(service.findOne).toHaveBeenCalledWith('t1', 'user-1');
  });

  it('forwards the staff actor when assigning', async () => {
    const { controller, service } = make();
    const dto = { assignedTo: 'agent', status: TicketStatus.IN_PROGRESS };
    await controller.assign('t1', dto, request);
    expect(service.assign).toHaveBeenCalledWith(
      't1',
      'agent',
      TicketStatus.IN_PROGRESS,
      'user-1',
    );
  });

  it('only lets the owner close their ticket', async () => {
    const { controller, service } = make();
    await controller.close('t1', request);
    expect(service.close).toHaveBeenCalledWith('t1', 'user-1');
  });

  it('forwards the ticket, caller and message when posting a message', async () => {
    const { controller, service } = make();
    await controller.addMessage('t1', request, { message: 'hello' });
    expect(service.addMessage).toHaveBeenCalledWith('t1', 'user-1', 'hello');
  });

  it('passes the caller and pagination options when reading messages', async () => {
    const { controller, service } = make();
    const page = { data: [], total: 0, page: 2, limit: 50 };
    service.getMessages.mockResolvedValue(page);
    const dto = { page: 2, limit: 50 };

    await expect(controller.getMessages('t1', request, dto)).resolves.toBe(
      page,
    );
    expect(service.getMessages).toHaveBeenCalledWith('t1', 'user-1', dto);

    service.getMessages.mockRejectedValue(
      new ForbiddenException('Access denied'),
    );
    await expect(
      controller.getMessages('t1', { user: { sub: 'stranger' } }, dto),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('accepts sub when the principal has no id', async () => {
    const { controller, service } = make();
    await controller.getMessages('t1', { user: { sub: 'user-1' } }, {});
    expect(service.getMessages).toHaveBeenCalledWith('t1', 'user-1', {});
  });

  it('exposes staff queue, status and reopen routes to staff roles only', () => {
    const reflector = new Reflector();
    const { controller, admin } = make();
    const methodOf = (instance: object, name: string): object =>
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(instance), name)
        ?.value as object;

    expect(
      reflector.getAllAndOverride(ROLES_KEY, [
        methodOf(controller, 'assign'),
        SupportTicketsController,
      ]),
    ).toEqual([Role.ADMIN, Role.COMPLIANCE]);
    expect(
      reflector.getAllAndOverride(ROLES_KEY, [
        methodOf(admin, 'findAll'),
        AdminSupportTicketsController,
      ]),
    ).toEqual([Role.ADMIN, Role.COMPLIANCE]);
    expect(
      reflector.getAllAndOverride(ROLES_KEY, [
        methodOf(admin, 'changeStatus'),
        AdminSupportTicketsController,
      ]),
    ).toEqual([Role.ADMIN, Role.COMPLIANCE]);
    expect(
      reflector.getAllAndOverride(ROLES_KEY, [
        methodOf(admin, 'reopen'),
        AdminSupportTicketsController,
      ]),
    ).toEqual([Role.ADMIN, Role.COMPLIANCE]);
  });

  it('delegates staff queue, status and reopen actions', async () => {
    const { admin, service } = make();
    await admin.findAll({ status: TicketStatus.OPEN });
    expect(service.findAllForStaff).toHaveBeenCalledWith({
      status: TicketStatus.OPEN,
    });

    await admin.changeStatus(
      '00000000-0000-4000-8000-000000000001',
      { status: TicketStatus.RESOLVED },
      request,
    );
    expect(service.changeStatus).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000001',
      TicketStatus.RESOLVED,
      'user-1',
    );

    await admin.reopen('00000000-0000-4000-8000-000000000001', request);
    expect(service.reopen).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000001',
      'user-1',
    );
  });
});

describe('CreateTicketMessageDto', () => {
  const errorsFor = async (message: string) => {
    const dto = plainToInstance(CreateTicketMessageDto, { message });
    return validate(dto);
  };

  it('trims messages and rejects blank or oversized bodies', async () => {
    await expect(errorsFor('   ')).resolves.toHaveLength(1);
    await expect(errorsFor('a'.repeat(5001))).resolves.toHaveLength(1);
    await expect(errorsFor(`${'a'.repeat(5000)}   `)).resolves.toHaveLength(0);

    const dto = plainToInstance(CreateTicketMessageDto, {
      message: '  hello  ',
    });
    expect(dto.message).toBe('hello');
  });
});
