import { Test, TestingModule } from '@nestjs/testing';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';
import { TicketStatus, TicketPriority } from './entities/support-ticket.entity';

describe('SupportController', () => {
  let controller: SupportController;
  let service: SupportService;

  const mockSupportService = {
    createTicket: jest.fn(),
    getUserTickets: jest.fn(),
    getTicketById: jest.fn(),
    addMessage: jest.fn(),
  };

  const mockRequest = {
    user: {
      id: 'user-123',
      email: 'test@example.com',
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SupportController],
      providers: [
        {
          provide: SupportService,
          useValue: mockSupportService,
        },
      ],
    }).compile();

    controller = module.get<SupportController>(SupportController);
    service = module.get<SupportService>(SupportService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createTicket', () => {
    it('should create a new support ticket', async () => {
      const createTicketDto = {
        subject: 'Cannot login',
        description: 'I am unable to log into my account',
        priority: TicketPriority.HIGH,
      };

      const expectedResult = {
        id: 'ticket-123',
        ...createTicketDto,
        userId: mockRequest.user.id,
        status: TicketStatus.OPEN,
        createdAt: new Date(),
      };

      mockSupportService.createTicket.mockResolvedValue(expectedResult);

      const result = await controller.createTicket(mockRequest, createTicketDto);

      expect(service.createTicket).toHaveBeenCalledWith(
        mockRequest.user.id,
        createTicketDto,
      );
      expect(result).toEqual(expectedResult);
    });
  });

  describe('getUserTickets', () => {
    it('should return all tickets for the current user', async () => {
      const query = { limit: '10', offset: '0' };
      const expectedResult = {
        tickets: [
          {
            id: 'ticket-1',
            subject: 'Issue 1',
            status: TicketStatus.OPEN,
          },
          {
            id: 'ticket-2',
            subject: 'Issue 2',
            status: TicketStatus.RESOLVED,
          },
        ],
        total: 2,
      };

      mockSupportService.getUserTickets.mockResolvedValue(expectedResult);

      const result = await controller.getUserTickets(mockRequest, query);

      expect(service.getUserTickets).toHaveBeenCalledWith(
        mockRequest.user.id,
        query,
      );
      expect(result).toEqual(expectedResult);
    });

    it('should filter tickets by status', async () => {
      const query = {
        status: TicketStatus.OPEN,
        limit: '10',
        offset: '0',
      };

      const expectedResult = {
        tickets: [
          {
            id: 'ticket-1',
            subject: 'Issue 1',
            status: TicketStatus.OPEN,
          },
        ],
        total: 1,
      };

      mockSupportService.getUserTickets.mockResolvedValue(expectedResult);

      const result = await controller.getUserTickets(mockRequest, query);

      expect(service.getUserTickets).toHaveBeenCalledWith(
        mockRequest.user.id,
        query,
      );
      expect(result.tickets).toHaveLength(1);
      expect(result.tickets[0].status).toBe(TicketStatus.OPEN);
    });
  });

  describe('getTicket', () => {
    it('should return a specific ticket', async () => {
      const ticketId = 'ticket-123';
      const expectedResult = {
        id: ticketId,
        subject: 'Test Issue',
        description: 'Description',
        status: TicketStatus.OPEN,
        userId: mockRequest.user.id,
        messages: [],
      };

      mockSupportService.getTicketById.mockResolvedValue(expectedResult);

      const result = await controller.getTicket(mockRequest, ticketId);

      expect(service.getTicketById).toHaveBeenCalledWith(
        ticketId,
        mockRequest.user.id,
      );
      expect(result).toEqual(expectedResult);
    });
  });

  describe('addMessage', () => {
    it('should add a message to a ticket', async () => {
      const ticketId = 'ticket-123';
      const createMessageDto = {
        content: 'I tried resetting my password',
      };

      const expectedResult = {
        id: 'message-123',
        content: createMessageDto.content,
        ticketId,
        authorId: mockRequest.user.id,
        isInternal: false,
        createdAt: new Date(),
      };

      mockSupportService.addMessage.mockResolvedValue(expectedResult);

      const result = await controller.addMessage(
        mockRequest,
        ticketId,
        createMessageDto,
      );

      expect(service.addMessage).toHaveBeenCalledWith(
        ticketId,
        mockRequest.user.id,
        createMessageDto,
      );
      expect(result).toEqual(expectedResult);
    });

    it('should not allow users to create internal messages', async () => {
      const ticketId = 'ticket-123';
      const createMessageDto = {
        content: 'Internal note',
        isInternal: true,
      };

      const expectedResult = {
        id: 'message-123',
        content: createMessageDto.content,
        ticketId,
        authorId: mockRequest.user.id,
        isInternal: false, // Service should override this to false
        createdAt: new Date(),
      };

      mockSupportService.addMessage.mockResolvedValue(expectedResult);

      const result = await controller.addMessage(
        mockRequest,
        ticketId,
        createMessageDto,
      );

      expect(result.isInternal).toBe(false);
    });
  });
});