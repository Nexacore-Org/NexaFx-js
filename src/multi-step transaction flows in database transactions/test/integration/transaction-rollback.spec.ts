import { Test, TestingModule } from "@nestjs/testing";
import { DataSource } from "typeorm";
import { TransactionService } from "../../src/common/services/transaction.service";
import { TransactionExecutionService } from "../../src/transactions/services/transaction-execution.service";
import { RetryJobService } from "../../src/transactions/services/retry-job.service";
import { SnapshotService } from "../../src/snapshots/services/snapshot.service";
import { WebhookDispatchService } from "../../src/webhooks/services/webhook-dispatch.service";

describe("Transaction Rollback Integration Tests", () => {
  let module: TestingModule;
  let dataSource: DataSource;
  let transactionService: TransactionService;
  let transactionExecutionService: TransactionExecutionService;
  let retryJobService: RetryJobService;
  let snapshotService: SnapshotService;
  let webhookDispatchService: WebhookDispatchService;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [
        TransactionService,
        TransactionExecutionService,
        RetryJobService,
        SnapshotService,
        WebhookDispatchService,
        {
          provide: DataSource,
          useValue: {
            createQueryRunner: jest.fn(),
          },
        },
      ],
    }).compile();

    dataSource = module.get<DataSource>(DataSource);
    transactionService = module.get<TransactionService>(TransactionService);
    transactionExecutionService = module.get<TransactionExecutionService>(
      TransactionExecutionService,
    );
    retryJobService = module.get<RetryJobService>(RetryJobService);
    snapshotService = module.get<SnapshotService>(SnapshotService);
    webhookDispatchService = module.get<WebhookDispatchService>(
      WebhookDispatchService,
    );
  });

  describe("Transaction Execution Rollback", () => {
    it("should rollback all changes when transaction execution fails", async () => {
      const mockQueryRunner = {
        connect: jest.fn(),
        startTransaction: jest.fn(),
        commitTransaction: jest.fn(),
        rollbackTransaction: jest.fn(),
        release: jest.fn(),
        manager: {
          query: jest
            .fn()
            .mockResolvedValueOnce([]) // idempotency check
            .mockResolvedValueOnce([{ id: "1" }]) // create transaction
            .mockRejectedValueOnce(new Error("Balance update failed")), // fail on balance update
        },
      };

      jest
        .spyOn(dataSource, "createQueryRunner")
        .mockReturnValue(mockQueryRunner as any);

      await expect(
        transactionExecutionService.executeTransaction({
          idempotencyKey: "test-key",
          amount: 100,
        }),
      ).rejects.toThrow("Balance update failed");

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it("should not create partial records on rollback", async () => {
      const mockQueryRunner = {
        connect: jest.fn(),
        startTransaction: jest.fn(),
        rollbackTransaction: jest.fn(),
        release: jest.fn(),
        manager: {
          query: jest
            .fn()
            .mockResolvedValueOnce([]) // idempotency check
            .mockResolvedValueOnce([{ id: "1" }]) // create transaction
            .mockResolvedValueOnce(undefined) // update balance 1
            .mockRejectedValueOnce(new Error("Audit log failed")), // fail on audit log
        },
      };

      jest
        .spyOn(dataSource, "createQueryRunner")
        .mockReturnValue(mockQueryRunner as any);

      await expect(
        transactionExecutionService.executeTransaction({
          idempotencyKey: "test-key-2",
          amount: 100,
        }),
      ).rejects.toThrow("Audit log failed");

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });
  });

  describe("Retry Job Rollback", () => {
    it("should rollback retry job creation on failure", async () => {
      const mockQueryRunner = {
        connect: jest.fn(),
        startTransaction: jest.fn(),
        rollbackTransaction: jest.fn(),
        release: jest.fn(),
        manager: {
          query: jest
            .fn()
            .mockResolvedValueOnce([]) // idempotency check
            .mockResolvedValueOnce([{ id: "1" }]) // create retry job
            .mockRejectedValueOnce(new Error("Retry count update failed")),
        },
      };

      jest
        .spyOn(dataSource, "createQueryRunner")
        .mockReturnValue(mockQueryRunner as any);

      await expect(
        retryJobService.createRetryJob({
          transactionId: "tx-1",
          attemptNumber: 1,
        }),
      ).rejects.toThrow("Retry count update failed");

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });

    it("should rollback retry job processing on execution failure", async () => {
      const mockQueryRunner = {
        connect: jest.fn(),
        startTransaction: jest.fn(),
        rollbackTransaction: jest.fn(),
        release: jest.fn(),
        manager: {
          query: jest
            .fn()
            .mockResolvedValueOnce(undefined) // mark processing
            .mockResolvedValueOnce([{ id: "1", transactionId: "tx-1" }]) // get job
            .mockRejectedValueOnce(new Error("Execution failed")),
        },
      };

      jest
        .spyOn(dataSource, "createQueryRunner")
        .mockReturnValue(mockQueryRunner as any);

      await expect(retryJobService.processRetryJob("job-1")).rejects.toThrow(
        "Execution failed",
      );

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });
  });

  describe("Snapshot Rollback", () => {
    it("should rollback snapshot creation on failure", async () => {
      const mockQueryRunner = {
        connect: jest.fn(),
        startTransaction: jest.fn(),
        rollbackTransaction: jest.fn(),
        release: jest.fn(),
        manager: {
          query: jest
            .fn()
            .mockResolvedValueOnce([]) // idempotency check
            .mockResolvedValueOnce([{ id: "snap-1" }]) // create snapshot
            .mockResolvedValueOnce(undefined) // archive old
            .mockRejectedValueOnce(new Error("Entity update failed")),
        },
      };

      jest
        .spyOn(dataSource, "createQueryRunner")
        .mockReturnValue(mockQueryRunner as any);

      await expect(
        snapshotService.createSnapshot({
          entityId: "entity-1",
          version: 2,
          data: {},
        }),
      ).rejects.toThrow("Entity update failed");

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });

    it("should rollback snapshot restore on failure", async () => {
      const mockQueryRunner = {
        connect: jest.fn(),
        startTransaction: jest.fn(),
        rollbackTransaction: jest.fn(),
        release: jest.fn(),
        manager: {
          query: jest
            .fn()
            .mockResolvedValueOnce([{ id: "snap-1", entityId: "entity-1" }]) // get snapshot
            .mockResolvedValueOnce(undefined) // restore state
            .mockRejectedValueOnce(new Error("Log creation failed")),
        },
      };

      jest
        .spyOn(dataSource, "createQueryRunner")
        .mockReturnValue(mockQueryRunner as any);

      await expect(
        snapshotService.restoreFromSnapshot("snap-1"),
      ).rejects.toThrow("Log creation failed");

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });
  });

  describe("Webhook Dispatch Rollback", () => {
    it("should rollback webhook dispatch on failure", async () => {
      const mockQueryRunner = {
        connect: jest.fn(),
        startTransaction: jest.fn(),
        rollbackTransaction: jest.fn(),
        release: jest.fn(),
        manager: {
          query: jest
            .fn()
            .mockResolvedValueOnce([]) // idempotency check
            .mockResolvedValueOnce([{ id: "dispatch-1" }]) // create dispatch
            .mockRejectedValueOnce(new Error("Event status update failed")),
        },
      };

      jest
        .spyOn(dataSource, "createQueryRunner")
        .mockReturnValue(mockQueryRunner as any);

      await expect(
        webhookDispatchService.dispatchWebhook({
          eventId: "event-1",
          webhookUrl: "https://example.com/webhook",
          payload: {},
        }),
      ).rejects.toThrow("Event status update failed");

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });

    it("should rollback webhook response recording on failure", async () => {
      const mockQueryRunner = {
        connect: jest.fn(),
        startTransaction: jest.fn(),
        rollbackTransaction: jest.fn(),
        release: jest.fn(),
        manager: {
          query: jest
            .fn()
            .mockResolvedValueOnce(undefined) // update dispatch log
            .mockResolvedValueOnce([{ id: "dispatch-1", eventId: "event-1" }]) // get dispatch
            .mockResolvedValueOnce(undefined) // update event status
            .mockRejectedValueOnce(new Error("Audit log failed")),
        },
      };

      jest
        .spyOn(dataSource, "createQueryRunner")
        .mockReturnValue(mockQueryRunner as any);

      await expect(
        webhookDispatchService.recordWebhookResponse("dispatch-1", {
          success: true,
        }),
      ).rejects.toThrow("Audit log failed");

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });
  });

  describe("Idempotency Tests", () => {
    it("should return existing transaction on duplicate execution", async () => {
      const existingTransaction = { id: "tx-1", status: "completed" };
      const mockQueryRunner = {
        connect: jest.fn(),
        startTransaction: jest.fn(),
        commitTransaction: jest.fn(),
        release: jest.fn(),
        manager: {
          query: jest.fn().mockResolvedValueOnce([existingTransaction]),
        },
      };

      jest
        .spyOn(dataSource, "createQueryRunner")
        .mockReturnValue(mockQueryRunner as any);

      const result = await transactionExecutionService.executeTransaction({
        idempotencyKey: "duplicate-key",
        amount: 100,
      });

      expect(result).toEqual(existingTransaction);
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
    });

    it("should return existing retry job on duplicate creation", async () => {
      const existingJob = { id: "job-1", status: "pending" };
      const mockQueryRunner = {
        connect: jest.fn(),
        startTransaction: jest.fn(),
        commitTransaction: jest.fn(),
        release: jest.fn(),
        manager: {
          query: jest.fn().mockResolvedValueOnce([existingJob]),
        },
      };

      jest
        .spyOn(dataSource, "createQueryRunner")
        .mockReturnValue(mockQueryRunner as any);

      const result = await retryJobService.createRetryJob({
        transactionId: "tx-1",
        attemptNumber: 1,
      });

      expect(result).toEqual(existingJob);
    });
  });

  afterAll(async () => {
    await module.close();
  });
});
