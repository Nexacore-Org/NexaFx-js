import { DataArchiveAdminController } from './data-archive-admin.controller';
import { DataArchiveService } from '../services/data-archive.service';

describe('DataArchiveAdminController', () => {
  let controller: DataArchiveAdminController;
  let archiveService: {
    getArchivedTransactions: jest.Mock;
    getArchivedTransactionById: jest.Mock;
    restoreTransaction: jest.Mock;
    getArchivedApiUsageLogs: jest.Mock;
    restoreApiUsageLog: jest.Mock;
    runArchivalJob: jest.Mock;
  };

  beforeEach(async () => {
    archiveService = {
      getArchivedTransactions: jest.fn(),
      getArchivedTransactionById: jest.fn(),
      restoreTransaction: jest.fn(),
      getArchivedApiUsageLogs: jest.fn(),
      restoreApiUsageLog: jest.fn(),
      runArchivalJob: jest.fn(),
    };

    controller = new DataArchiveAdminController(
      archiveService as unknown as DataArchiveService,
    );
  });

  it('should return archived transactions list', async () => {
    archiveService.getArchivedTransactions.mockResolvedValue({
      success: true,
      data: [],
      meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });

    const result = await controller.getArchivedTransactions({ page: 1, limit: 20 });

    expect(archiveService.getArchivedTransactions).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
    });
    expect(result.success).toBe(true);
  });

  it('should restore archived transaction with request user id', async () => {
    archiveService.restoreTransaction.mockResolvedValue({ success: true });

    await controller.restoreArchivedTransaction(
      '1f81f3fa-f770-4f3d-9fd1-6da2a533df22',
      { user: { id: 'admin-1' } },
    );

    expect(archiveService.restoreTransaction).toHaveBeenCalledWith(
      '1f81f3fa-f770-4f3d-9fd1-6da2a533df22',
      'admin-1',
    );
  });

  it('should trigger manual archive run', async () => {
    archiveService.runArchivalJob.mockResolvedValue({
      cutoffDate: new Date().toISOString(),
      archivedTransactions: 0,
      archivedTransactionSnapshots: 0,
      archivedTransactionRisks: 0,
      archivedApiUsageLogs: 0,
    });

    const result = await controller.runArchiveNow();

    expect(archiveService.runArchivalJob).toHaveBeenCalled();
    expect(result.archivedTransactions).toBe(0);
  });
});
