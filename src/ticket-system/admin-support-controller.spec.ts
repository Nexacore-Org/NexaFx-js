import { Test, TestingModule } from '@nestjs/testing';
import { AdminSupportController } from './admin-support.controller';
import { SupportService } from './support.service';
import { TicketStatus, TicketPriority } from './entities/support-ticket.entity';

describe('AdminSupportController', () => {
  let controller: AdminSupportController;
  let service: SupportService;

  const mockSupportService = {
    getAllTickets: jest.fn(),
    getTicketByIdAdmin: jest.fn(),
    updateTicket: jest.fn(),
    addMessageAdmin: jest.fn(),
    deleteTicket: jest.fn(),
  };

  const mockAdminRequest = {
    user: {
      id: 'admin-123',
      email: 'admin@example.com',
      role: 'admin',
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminSupportController],
      providers: [
        {
          provide: SupportService,
          useValue: mockSupportService,
        },
      ],
    }).compile();

    controller = module.get<AdminSupportController>(AdminSupportController);
    service = module.get<SupportService>(SupportService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getAllTickets', () => {
    it('should return all support tickets', async () => {
      const query = { limit: '20', offset: '0' };
      const expectedResult = {
        tickets: [
          {
            id: 'ticket-1',
            subject: 'Issue 1',
            status: TicketStatus.OPEN,
            userId: 'user-1',
          },
          {
            id: 'ticket-2',
            subject: 'Issue 2',
            status: TicketStatus.PENDING,
            userId: 'user-2',
          },
        ],
        total: 2,
      };

      mockSupportService.getAllTickets.mockResolvedValue(expectedResult);

      const result = await controller.getAllTickets(query);

      expect(service.getAllTickets).toHaveBeenCalledWith(query);
      expect(result).toEqual(expectedResult);
      expect(result.tickets).toHaveLength(2);
    });

    it('should filter tickets by status and priority', async () => {
      const query = {
        status: TicketStatus.OPEN,
        priority: TicketPriority.URGENT,
        limit: '10',
        offset: '0',
      };

      const expectedResult = {
        tickets: [
          {
            id: 'ticket-1',
            status: TicketStatus.OPEN,
            priority: TicketPriority.URGENT,
          },
        ],
        total: 1,
      };

      mockSupportService.getAllTickets.mockResolvedValue(expectedResult);

      const result = await controller.getAllTickets(query);

      expect(service.getAllTickets).toHaveBeenCalledWith(query);
      expect(result.tickets[0].status).toBe(TicketStatus.OPEN);
      expect(result.tickets[0].priority).toBe(TicketPriority.URGENT);
    });
  });

  describe('getTicket', () => {
    it('should return a ticket with all messages including internal ones', async () => {
      const ticketId = 'ticket-123';
      const expectedResult = {
        id: ticketId,
        subject: 'Test Issue',
        userId: 'user-123',
        messages: [
          {
            id: 'msg-1',
            content: 'User message',
            isInternal: false,
          },
          {
            id: 'msg-2',
            content: 'Internal note',
            isInternal: true,
          },
        ],
      };

      mockSupportService.getTicketByIdAdmin.mockResolvedValue(expectedResult);

      const result = await controller.getTicket(ticketId);

      expect(service.getTicketByIdAdmin).toHaveBeenCalledWith(ticketId);
      expect(result.messages).toHaveLength(2);
      expect(result.messages.some((m) => m.isInternal)).toBe(true);
    });
  });

  describe('updateTicket', () => {
    it('should update ticket status', async () => {
      const ticketId = 'ticket-123';
      const updateDto = {
        status: TicketStatus.RESOLVED,
      };

      const expectedResult = {
        id: ticketId,
        status: TicketStatus.RESOLVED,
        updatedAt: new Date(),
      };

      mockSupportService.updateTicket.mockResolvedValue(expectedResult);

      const result = await controller.updateTicket(ticketId, updateDto);

      expect(service.updateTicket).toHaveBeenCalledWith(ticketId, updateDto);
      expect(result.status).toBe(TicketStatus.RESOLVED);
    });

    it('should assign ticket to support agent', async () => {
      const ticketId = 'ticket-123';
      const updateDto = {
        assignedToId: 'agent-456',
      };

      const expectedResult = {
        id: ticketId,
        assignedToId: 'agent-456',
        assignedTo: {
          id: 'agent-456',
          email: 'agent@example.com',
        },
      };

      mockSupportService.updateTicket.mockResolvedValue(expectedResult);

      const result = await controller.updateTicket(ticketId, updateDto);

      expect(service.updateTicket).toHaveBeenCalledWith(ticketId, updateDto);
      expect(result.assignedToId).toBe('agent-456');
    });

    it('should update priority', async () => {
      const ticketId = 'ticket-123';
      const updateDto = {
        priority: TicketPriority.URGENT,
      };

      const expectedResult = {
        id: ticketId,
        priority: TicketPriority.URGENT,
      };

      mockSupportService.updateTicket.mockResolvedValue(expectedResult);

      const result = await controller.updateTicket(ticketId, updateDto);

      expect(result.priority).toBe(TicketPriority.URGENT);
    });
  });

  describe('addMessage', () => {
    it('should allow admin to add public messages', async () => {
      const ticketId = 'ticket-123';
      const createMessageDto = {
        content: 'We are looking into this issue',
        isInternal: false,
      };

      const expectedResult = {
        id: 'message-123',
        content: createMessageDto.content,
        ticketId,
        authorId: mockAdminRequest.user.id,
        isInternal: false,
        createdAt: new Date(),
      };

      mockSupportService.addMessageAdmin.mockResolvedValue(expectedResult);

      const result = await controller.addMessage(
        mockAdminRequest,
        ticketId,
        createMessageDto,
      );

      expect(service.addMessageAdmin).toHaveBeenCalledWith(
        ticketId,
        mockAdminRequest.user.id,
        createMessageDto,
      );
      expect(result).toEqual(expectedResult);
    });

    it('should allow admin to add internal messages', async () => {
      const ticketId = 'ticket-123';
      const createMessageDto = {
        content: 'Internal note: user has been flagged',
        isInternal: true,
      };

      const expectedResult = {
        id: 'message-123',
        content: createMessageDto.content,
        ticketId,
        authorId: mockAdminRequest.user.id,
        isInternal: true,
        createdAt: new Date(),
      };

      mockSupportService.addMessageAdmin.mockResolvedValue(expectedResult);

      const result = await controller.addMessage(
        mockAdminRequest,
        ticketId,
        createMessageDto,
      );

      expect(result.isInternal).toBe(true);
    });
  });

  describe('deleteTicket', () => {
    it('should delete a ticket', async () => {
      const ticketId = 'ticket-123';

      mockSupportService.deleteTicket.mockResolvedValue(undefined);

      const result = await controller.deleteTicket(ticketId);

      expect(service.deleteTicket).toHaveBeenCalledWith(ticketId);
      expect(result).toEqual({ message: 'Ticket deleted successfully' });
    });
  });
});