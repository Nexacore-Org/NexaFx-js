import { FeeSummaryGenerator } from './fee-summary.generator';
import { PortfolioGenerator } from './portfolio.generator';
import { TransactionSummaryGenerator } from './transaction-summary.generator';
import {
  ReportFrequency,
  ReportType,
  ScheduledReport,
} from '../entities/scheduled-report.entity';

describe('scheduled report generators', () => {
  const report = {
    id: 'report-1',
    userId: 'user-1',
    reportType: ReportType.TRANSACTION_SUMMARY,
    frequency: ReportFrequency.MONTHLY,
  } as ScheduledReport;
  const periodStart = new Date('2026-01-01T00:00:00.000Z');
  const periodEnd = new Date('2026-02-01T00:00:00.000Z');
  const ctx = { report, periodStart, periodEnd };

  it('builds a transaction summary from statements', async () => {
    const statements = {
      buildStatement: jest.fn().mockResolvedValue({
        generatedAt: '2026-02-01T00:00:00.000Z',
        currency: 'USD',
        period: { from: '2026-01-01', to: '2026-02-01' },
        openingBalance: 0,
        closingBalance: 25,
        lines: [{ date: '2026-01-15', amount: 25 }],
      }),
    };
    const generator = new TransactionSummaryGenerator(statements as any);

    const result = await generator.generate(ctx);

    expect(statements.buildStatement).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        currency: 'USD',
        from: periodStart.toISOString(),
        to: periodEnd.toISOString(),
        format: 'json',
      }),
    );
    expect(result.payload).toMatchObject({ lineCount: 1, closingBalance: 25 });
    expect(result.emailText).toContain('transaction summary');
  });

  it('builds a fee summary from fee reports', async () => {
    const feeReports = {
      generate: jest.fn().mockResolvedValue({
        id: 'fee-report-1',
        period: 'monthly',
        startDate: periodStart,
        endDate: periodEnd,
        totalFees: 3,
        feeBreakdown: { USD: 3 },
        generatedAt: periodEnd,
      }),
    };
    const generator = new FeeSummaryGenerator(feeReports as any);

    const result = await generator.generate(ctx);

    expect(feeReports.generate).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ period: 'monthly' }),
    );
    expect(result.fileReference).toBe('fee-report:fee-report-1');
    expect(result.payload).toMatchObject({ totalFees: 3 });
  });

  it('builds a portfolio summary from current holdings', async () => {
    const portfolio = {
      getCurrentHoldings: jest.fn().mockResolvedValue({
        holdings: { USD: 10 },
        totalValueUsd: 10,
      }),
    };
    const generator = new PortfolioGenerator(portfolio as any);

    const result = await generator.generate(ctx);

    expect(portfolio.getCurrentHoldings).toHaveBeenCalledWith('user-1');
    expect(result.payload).toMatchObject({
      holdings: { USD: 10 },
      totalValueUsd: 10,
    });
  });
});
