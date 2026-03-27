import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfirmationTracker } from './confirmation.tracker';
import { BlockchainService } from './blockchain.service';
import { TransactionEntity } from '../transactions/entities/transaction.entity';

describe('ConfirmationTracker', () => {
  let tracker: ConfirmationTracker;
  let mockBlockchainService: any;
  let mockTxRepo: any;

  const mockTransaction = {
    id: 'tx-1',
    status: 'PENDING',
    metadata: { txHash: '0x1234567890' },
  } as TransactionEntity;

  beforeEach(async () => {
    mockBlockchainService = {
      getTransactionReceipt: jest.fn(),
      getCurrentBlock: jest.fn(),
      getTransactionStatus: jest.fn(),
    };

    mockTxRepo = {
      findOne: jest.fn().mockResolvedValue(mockTransaction),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConfirmationTracker,
        {
          provide: BlockchainService,
          useValue: mockBlockchainService,
        },
        {
          provide: getRepositoryToken(TransactionEntity),
          useValue: mockTxRepo,
        },
      ],
    }).compile();

    tracker = module.get<ConfirmationTracker>(ConfirmationTracker);
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  describe('trackTransaction', () => {
    it('should start tracking a transaction', async () => {
      jest.useFakeTimers();

      mockBlockchainService.getTransactionReceipt.mockResolvedValue({
        blockNumber: 100,
        isValid: true,
        confirmations: 5,
      });

      const trackPromise = tracker.trackTransaction('0x1234567890');
      expect(trackPromise).toBeInstanceOf(Promise);

      jest.advanceTimersByTime(15000); // One poll interval
      jest.runAllTimersAsync();

      jest.useRealTimers();
    });

    it('should finalize transaction when required confirmations reached', async () => {
      jest.useFakeTimers();

      mockBlockchainService.getTransactionReceipt.mockResolvedValue({
        blockNumber: 100,
        isValid: true,
        confirmations: 12, // Required confirmations met
      });

      mockBlockchainService.getTransactionStatus.mockResolvedValue('SUCCESS');

      await tracker.trackTransaction('0x1234567890');

      // Advance time to trigger the interval
      jest.advanceTimersByTime(15000);
      await new Promise((resolve) => setImmediate(resolve));

      expect(mockTxRepo.update).toHaveBeenCalledWith('tx-1', {
        status: 'SUCCESS',
      });

      jest.useRealTimers();
    });

    it('should mark transaction as orphaned when reorg detected', async () => {
      jest.useFakeTimers();

      mockBlockchainService.getTransactionReceipt.mockResolvedValue({
        blockNumber: 0,
        isValid: false, // Reorg detected
        confirmations: 0,
      });

      await tracker.trackTransaction('0x1234567890');

      jest.advanceTimersByTime(15000);
      await new Promise((resolve) => setImmediate(resolve));

      expect(mockTxRepo.update).toHaveBeenCalledWith('tx-1', {
        status: 'FAILED',
      });

      jest.useRealTimers();
    });

    it('should handle transaction not found in database', async () => {
      jest.useFakeTimers();

      mockTxRepo.findOne.mockResolvedValueOnce(null);

      mockBlockchainService.getTransactionReceipt.mockResolvedValue({
        blockNumber: 100,
        isValid: true,
        confirmations: 12,
      });

      mockBlockchainService.getTransactionStatus.mockResolvedValue('SUCCESS');

      await tracker.trackTransaction('0x1234567890');

      jest.advanceTimersByTime(15000);
      await new Promise((resolve) => setImmediate(resolve));

      // Should not crash, just log warning
      expect(mockTxRepo.update).not.toHaveBeenCalled();

      jest.useRealTimers();
    });

    it('should handle RPC errors gracefully', async () => {
      jest.useFakeTimers();

      mockBlockchainService.getTransactionReceipt.mockRejectedValue(
        new Error('RPC connection failed'),
      );

      await tracker.trackTransaction('0x1234567890');

      jest.advanceTimersByTime(15000);
      await new Promise((resolve) => setImmediate(resolve));

      // Should not update transaction on error
      expect(mockTxRepo.update).not.toHaveBeenCalled();

      jest.useRealTimers();
    });

    it('should continue polling until finalization', async () => {
      jest.useFakeTimers();

      // First call: 5 confirmations (not enough)
      // Second call: 12 confirmations (enough)
      mockBlockchainService.getTransactionReceipt
        .mockResolvedValueOnce({
          blockNumber: 100,
          isValid: true,
          confirmations: 5,
        })
        .mockResolvedValueOnce({
          blockNumber: 100,
          isValid: true,
          confirmations: 12,
        });

      mockBlockchainService.getTransactionStatus.mockResolvedValue('SUCCESS');

      await tracker.trackTransaction('0x1234567890');

      // First poll - not enough confirmations
      jest.advanceTimersByTime(15000);
      await new Promise((resolve) => setImmediate(resolve));

      expect(mockBlockchainService.getTransactionReceipt).toHaveBeenCalledTimes(1);

      // Second poll - enough confirmations
      jest.advanceTimersByTime(15000);
      await new Promise((resolve) => setImmediate(resolve));

      expect(mockBlockchainService.getTransactionReceipt).toHaveBeenCalledTimes(2);
      expect(mockTxRepo.update).toHaveBeenCalled();

      jest.useRealTimers();
    });
  });

  describe('stopTrackingTransaction', () => {
    it('should stop tracking a transaction', () => {
      const txHash = '0x1234567890';

      // Start tracking
      tracker.trackTransaction(txHash);

      // Stop tracking
      tracker.stopTrackingTransaction(txHash);

      // Verify tracker is removed (internal state check)
      // Since we can't directly access the map, we verify through behavior
      expect(tracker.stopTrackingTransaction(txHash)).not.toThrow();
    });
  });

  describe('onModuleDestroy', () => {
    it('should clean up all active trackers on shutdown', async () => {
      jest.useFakeTimers();

      mockBlockchainService.getTransactionReceipt.mockResolvedValue({
        blockNumber: 100,
        isValid: true,
        confirmations: 5,
      });

      await tracker.trackTransaction('0x1234567890');
      await tracker.trackTransaction('0x0987654321');

      // Cleanup should not throw
      expect(() => tracker.onModuleDestroy()).not.toThrow();

      jest.useRealTimers();
    });
  });

  describe('finalizeTransaction', () => {
    it('should set transaction status to SUCCESS', async () => {
      jest.useFakeTimers();

      mockBlockchainService.getTransactionReceipt.mockResolvedValue({
        blockNumber: 100,
        isValid: true,
        confirmations: 12,
      });

      mockBlockchainService.getTransactionStatus.mockResolvedValue('SUCCESS');

      await tracker.trackTransaction('0x1234567890');

      jest.advanceTimersByTime(15000);
      await new Promise((resolve) => setImmediate(resolve));

      expect(mockTxRepo.update).toHaveBeenCalledWith('tx-1', {
        status: 'SUCCESS',
      });

      jest.useRealTimers();
    });

    it('should set transaction status to FAILED', async () => {
      jest.useFakeTimers();

      mockBlockchainService.getTransactionReceipt.mockResolvedValue({
        blockNumber: 100,
        isValid: true,
        confirmations: 12,
      });

      mockBlockchainService.getTransactionStatus.mockResolvedValue('FAILED');

      await tracker.trackTransaction('0x1234567890');

      jest.advanceTimersByTime(15000);
      await new Promise((resolve) => setImmediate(resolve));

      expect(mockTxRepo.update).toHaveBeenCalledWith('tx-1', {
        status: 'FAILED',
      });

      jest.useRealTimers();
    });
  });

  describe('markAsOrphaned', () => {
    it('should mark transaction as FAILED when orphaned', async () => {
      jest.useFakeTimers();

      mockBlockchainService.getTransactionReceipt.mockResolvedValue({
        blockNumber: 0,
        isValid: false,
        confirmations: 0,
      });

      await tracker.trackTransaction('0x1234567890');

      jest.advanceTimersByTime(15000);
      await new Promise((resolve) => setImmediate(resolve));

      expect(mockTxRepo.update).toHaveBeenCalledWith('tx-1', {
        status: 'FAILED',
      });

      jest.useRealTimers();
    });
  });
});
