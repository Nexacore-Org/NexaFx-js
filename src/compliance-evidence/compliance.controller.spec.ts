import { Test, TestingModule } from '@nestjs/testing';
import { ComplianceController } from './compliance.controller';
import { ComplianceService } from './compliance.service';
import { ComplianceGuard } from './guards/compliance.guard';
import { ReportType, ExportFormat, ReportStatus } from './enums/report-type.enum';

const mockComplianceService = {
  requestReport: jest.fn(),
  listReports: jest.fn(),
  findReport: jest.fn(),
  exportReport: jest.fn(),
  verifyChecksum: jest.fn(),
  snapshotAuditEvidence: jest.fn(),
};

const mockComplianceGuard = { canActivate: jest.fn().mockReturnValue(true) };

describe('ComplianceController', () => {
  let controller: ComplianceController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ComplianceController],
      providers: [{ provide: ComplianceService, useValue: mockComplianceService }],
    })
      .overrideGuard(ComplianceGuard)
      .useValue(mockComplianceGuard)
      .compile();

    controller = module.get<ComplianceController>(ComplianceController);
  });

  describe('requestReport', () => {
    it('should queue a report and return pending record', async () => {
      const dto = {
        reportType: ReportType.TRANSACTION_SUMMARY,
        exportFormat: ExportFormat.JSON,
      };
      const pending = { id: 'r1', status: ReportStatus.PENDING };
      mockComplianceService.requestReport.mockResolvedValue(pending);

      const req = { user: { id: 'user-1' } };
      const result = await controller.requestReport(dto as any, req);

      expect(mockComplianceService.requestReport).toHaveBeenCalledWith(dto, 'user-1');
      expect(result).toBe(pending);
    });

    it('should fall back to sub when id is absent', async () => {
      mockComplianceService.requestReport.mockResolvedValue({ id: 'r2', status: ReportStatus.PENDING });
      const req = { user: { sub: 'sub-123' } };
      await controller.requestReport({ reportType: ReportType.USER_ACTIVITY, exportFormat: ExportFormat.CSV } as any, req);
      expect(mockComplianceService.requestReport).toHaveBeenCalledWith(
        expect.any(Object),
        'sub-123',
      );
    });
  });

  describe('listReports', () => {
    it('should delegate to service with filters', async () => {
      const reports = [{ id: 'r1' }, { id: 'r2' }];
      mockComplianceService.listReports.mockResolvedValue(reports);
      const filters = { reportType: ReportType.FLAGGED_TRANSACTIONS };
      const result = await controller.listReports(filters as any);
      expect(mockComplianceService.listReports).toHaveBeenCalledWith(filters);
      expect(result).toHaveLength(2);
    });
  });

  describe('getReport', () => {
    it('should return a single report', async () => {
      const report = { id: 'r1', status: ReportStatus.COMPLETED };
      mockComplianceService.findReport.mockResolvedValue(report);
      const result = await controller.getReport('r1');
      expect(result).toBe(report);
    });
  });

  describe('exportReport', () => {
    it('should set correct headers and send content', async () => {
      mockComplianceService.exportReport.mockResolvedValue({
        content: '{"records":[]}',
        mimeType: 'application/json',
        filename: 'compliance-transaction_summary-r1.json',
      });

      const setHeader = jest.fn();
      const send = jest.fn();
      const res: any = { setHeader, send };

      await controller.exportReport('r1', res);

      expect(setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
      expect(setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="compliance-transaction_summary-r1.json"',
      );
      expect(send).toHaveBeenCalledWith('{"records":[]}');
    });
  });

  describe('verifyChecksum', () => {
    it('should return verification result', async () => {
      mockComplianceService.verifyChecksum.mockResolvedValue({
        valid: true,
        expected: 'abc',
        actual: 'abc',
      });
      const result = await controller.verifyChecksum('r1');
      expect(result.valid).toBe(true);
    });
  });

  describe('snapshotAudit', () => {
    it('should call snapshotAuditEvidence with actor info', async () => {
      const snapshot = { id: 'snap1', integrityHash: 'xyz' };
      mockComplianceService.snapshotAuditEvidence.mockResolvedValue(snapshot);

      const req = { user: { id: 'actor-1', role: 'compliance_officer' } };
      const result = await controller.snapshotAudit({} as any, req);

      expect(mockComplianceService.snapshotAuditEvidence).toHaveBeenCalledWith(
        'actor-1',
        'compliance_officer',
        { dateFrom: undefined, dateTo: undefined },
      );
      expect(result).toBe(snapshot);
    });
  });
});
