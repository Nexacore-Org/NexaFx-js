import { Test, TestingModule } from '@nestjs/testing';
import { ComplianceReportProcessor } from './jobs/compliance-report.processor';
import { ComplianceService } from './compliance.service';

const mockComplianceService = {
  processReport: jest.fn(),
};

describe('ComplianceReportProcessor', () => {
  let processor: ComplianceReportProcessor;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComplianceReportProcessor,
        { provide: ComplianceService, useValue: mockComplianceService },
      ],
    }).compile();

    processor = module.get<ComplianceReportProcessor>(ComplianceReportProcessor);
  });

  it('should call processReport with the job reportId', async () => {
    mockComplianceService.processReport.mockResolvedValue(undefined);

    await processor.handleGenerateReport({ data: { reportId: 'r-abc' } } as any);

    expect(mockComplianceService.processReport).toHaveBeenCalledWith('r-abc');
  });

  it('should propagate errors from processReport', async () => {
    mockComplianceService.processReport.mockRejectedValue(new Error('DB error'));

    await expect(
      processor.handleGenerateReport({ data: { reportId: 'r-fail' } } as any),
    ).rejects.toThrow('DB error');
  });
});
