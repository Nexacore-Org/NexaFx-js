import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { Repository, DataSource, QueryRunner } from 'typeorm';
import { getQueueToken } from '@nestjs/bull';
import { Queue } from 'bull';

import { SlaMonitorService } from './sla-monitor.service';
import { Dispute, DisputeState } from '../entities/dispute.entity';
import { TimelineEntry, TimelineEntryType } from '../entities/timeline-entry.entity';

describe('SlaMonitorService - Race Condition Tests', () => {
  let service: SlaMonitorService;
  let disputeRepository: Repository<Dispute>;
  let timelineRepository: Repository<TimelineEntry>;
  let dataSource: DataSource;
  let mockQueryRunner: Partial<QueryRunner>;

  beforeEach(async () => {
    // Mock QueryRunner
    mockQueryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: {
        findOne: jest.fn(),
        update: jest.fn(),
        save: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SlaMonitorService,
        {
          provide: getRepositoryToken(Dispute),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(TimelineEntry),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getDataSourceToken(),
          useValue: {
            createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
          },
        },
        {
          provide: getQueueToken('dispute'),
          useValue: {
            add: jest.fn(),
          },
        },
        {
          provide: getQueueToken('notification'),
          useValue: {
            add: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SlaMonitorService>(SlaMonitorService);
    disputeRepository = module.get<Repository<Dispute>>(getRepositoryToken(Dispute));
    timelineRepository = module.get<Repository<TimelineEntry>>(
      getRepositoryToken(TimelineEntry),
    );
    dataSource = module.get<DataSource>(getDataSourceToken());
  });

  describe('handleSlaViolation - Race Condition Prevention', () => {
    it('should handle concurrent SLA violation processing without duplicates', async () => {
      const mockDispute: Dispute = {
        id: 'dispute-1',
        escalationLevel: 0,
        slaDeadline: new Date(Date.now() - 1000), // Past deadline
        state: DisputeState.OPEN,
        assignedToId: 'agent-1',
        assignedTo: null,
        user: null,
        transaction: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Dispute;

      // Mock the query runner to simulate no existing violation
      (mockQueryRunner.manager.findOne as jest.Mock)
        .mockResolvedValueOnce(mockDispute) // First call for locked dispute
        .mockResolvedValueOnce(null); // Second call for existing violation (none found)

      (mockQueryRunner.manager.update as jest.Mock).mockResolvedValue({});
      (mockQueryRunner.manager.save as jest.Mock).mockResolvedValue({});

      // Call the method
      await service['handleSlaViolation'](mockDispute);

      // Verify that pessimistic locking was used
      expect(mockQueryRunner.connect).toHaveBeenCalled();
      expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();

      // Verify the dispute was updated
      expect(mockQueryRunner.manager.update).toHaveBeenCalledWith(
        Dispute,
        'dispute-1',
        expect.objectContaining({
          state: DisputeState.ESCALATED,
          escalationLevel: 1,
          escalationReason: 'SLA violation',
          assignedToId: null,
        }),
      );

      // Verify timeline entry was created
      expect(mockQueryRunner.manager.save).toHaveBeenCalledWith(
        TimelineEntry,
        expect.objectContaining({
          disputeId: 'dispute-1',
          type: TimelineEntryType.SLA_VIOLATION,
          actorType: 'system',
          payload: expect.objectContaining({
            status: 'processed',
            escalationLevel: 1,
          }),
        }),
      );
    });

    it('should skip processing if violation already exists', async () => {
      const mockDispute: Dispute = {
        id: 'dispute-1',
        escalationLevel: 0,
        slaDeadline: new Date(Date.now() - 1000),
        state: DisputeState.OPEN,
        assignedToId: 'agent-1',
        assignedTo: null,
        user: null,
        transaction: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Dispute;

      const existingViolation: TimelineEntry = {
        id: 'timeline-1',
        disputeId: 'dispute-1',
        type: TimelineEntryType.SLA_VIOLATION,
        payload: { status: 'processed' },
        actorType: 'system',
        createdAt: new Date(),
      } as TimelineEntry;

      // Mock the query runner to simulate existing violation
      (mockQueryRunner.manager.findOne as jest.Mock)
        .mockResolvedValueOnce(mockDispute) // First call for locked dispute
        .mockResolvedValueOnce(existingViolation); // Second call for existing violation

      // Call the method
      await service['handleSlaViolation'](mockDispute);

      // Verify that transaction was rolled back
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();

      // Verify no updates were made
      expect(mockQueryRunner.manager.update).not.toHaveBeenCalled();
      expect(mockQueryRunner.manager.save).not.toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      const mockDispute: Dispute = {
        id: 'dispute-1',
        escalationLevel: 0,
        slaDeadline: new Date(Date.now() - 1000),
        state: DisputeState.OPEN,
        assignedToId: 'agent-1',
        assignedTo: null,
        user: null,
        transaction: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Dispute;

      // Mock database error
      (mockQueryRunner.manager.findOne as jest.Mock).mockRejectedValue(
        new Error('Database connection failed'),
      );

      // Call the method and expect it to throw
      await expect(service['handleSlaViolation'](mockDispute)).rejects.toThrow(
        'Database connection failed',
      );

      // Verify that transaction was rolled back
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });
  });

  describe('handleStaleDispute - Race Condition Prevention', () => {
    it('should handle stale dispute processing atomically', async () => {
      const mockDispute: Dispute = {
        id: 'dispute-1',
        escalationLevel: 0,
        updatedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000), // 31 days ago
        state: DisputeState.OPEN,
        assignedToId: 'agent-1',
        assignedTo: null,
        user: null,
        transaction: null,
        createdAt: new Date(),
      } as Dispute;

      // Mock the query runner to simulate no existing handling
      (mockQueryRunner.manager.findOne as jest.Mock)
        .mockResolvedValueOnce(mockDispute) // First call for locked dispute
        .mockResolvedValueOnce(null); // Second call for existing handling (none found)

      (mockQueryRunner.manager.update as jest.Mock).mockResolvedValue({});
      (mockQueryRunner.manager.save as jest.Mock).mockResolvedValue({});

      // Call the method
      await service['handleStaleDispute'](mockDispute);

      // Verify atomic processing
      expect(mockQueryRunner.connect).toHaveBeenCalled();
      expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();

      // Verify the dispute was updated
      expect(mockQueryRunner.manager.update).toHaveBeenCalledWith(
        Dispute,
        'dispute-1',
        expect.objectContaining({
          state: DisputeState.ESCALATED,
          escalationLevel: 1,
          escalationReason: 'Stale dispute - no activity for 30 days',
          assignedToId: null,
        }),
      );
    });
  });
});
