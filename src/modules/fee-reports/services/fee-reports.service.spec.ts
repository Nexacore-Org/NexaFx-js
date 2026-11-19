import { BadRequestException } from '@nestjs/common';
import { FeeReportEntity } from '../entities/fee-report.entity';
import { FeeReportsService } from './fee-reports.service';

type RawTotal = { currency: string; total: string | number | null };

const makeReportQueryBuilder = (data: FeeReportEntity[] = [], total = 0) => {
  const qb: Record<string, jest.Mock> = {};
  qb.where = jest.fn().mockReturnValue(qb);
  qb.andWhere = jest.fn().mockReturnValue(qb);
  qb.orderBy = jest.fn().mockReturnValue(qb);
  qb.skip = jest.fn().mockReturnValue(qb);
  qb.take = jest.fn().mockReturnValue(qb);
  qb.getManyAndCount = jest.fn().mockResolvedValue([data, total]);
  return qb;
};

const makeRecordQueryBuilder = (rows: RawTotal[] = []) => {
  const qb: Record<string, jest.Mock> = {};
  qb.select = jest.fn().mockReturnValue(qb);
  qb.addSelect = jest.fn().mockReturnValue(qb);
  qb.where = jest.fn().mockReturnValue(qb);
  qb.andWhere = jest.fn().mockReturnValue(qb);
  qb.groupBy = jest.fn().mockReturnValue(qb);
  qb.getRawMany = jest.fn().mockResolvedValue(rows);
  return qb;
};

describe('FeeReportsService', () => {
  let reportQb: ReturnType<typeof makeReportQueryBuilder>;
  let recordQb: ReturnType<typeof makeRecordQueryBuilder>;
  let feeReportRepo: {
    createQueryBuilder: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let feeRecordRepo: { createQueryBuilder: jest.Mock };
  let service: FeeReportsService;

  const dateParams = () =>
    recordQb.andWhere.mock.calls.find(([sql]) =>
      String(sql).includes('BETWEEN'),
    )?.[1] as {
      startDate: Date;
      endDate: Date;
    };

  beforeEach(() => {
    reportQb = makeReportQueryBuilder();
    recordQb = makeRecordQueryBuilder();
    feeReportRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(reportQb),
      create: jest.fn((input: Record<string, unknown>) => ({
        id: 'report-1',
        ...input,
      })),
      save: jest.fn((report: FeeReportEntity) => Promise.resolve(report)),
    };
    feeRecordRepo = { createQueryBuilder: jest.fn().mockReturnValue(recordQb) };
    service = new FeeReportsService(
      feeReportRepo as never,
      feeRecordRepo as never,
    );
  });

  describe('generate() date ranges', () => {
    const endDate = '2026-06-15T12:00:00.000Z';

    it.each([
      ['daily', 1],
      ['weekly', 7],
    ] as const)('derives the %s range from endDate', async (period, days) => {
      await service.generate('user-1', { period, endDate });

      const expectedStart = new Date(endDate);
      expectedStart.setDate(expectedStart.getDate() - days);
      expect(dateParams()).toEqual({
        startDate: expectedStart,
        endDate: new Date(endDate),
      });
    });

    it('derives the monthly range from endDate', async () => {
      await service.generate('user-1', { period: 'monthly', endDate });

      const expectedStart = new Date(endDate);
      expectedStart.setMonth(expectedStart.getMonth() - 1);
      expect(dateParams()).toEqual({
        startDate: expectedStart,
        endDate: new Date(endDate),
      });
    });

    it('uses an explicit range unchanged', async () => {
      const startDate = '2026-06-01T00:00:00.000Z';

      await service.generate('user-1', {
        period: 'monthly',
        startDate,
        endDate,
      });

      expect(dateParams()).toEqual({
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      });
    });

    it('rejects a reversed range before querying fee records', async () => {
      await expect(
        service.generate('user-1', {
          period: 'daily',
          startDate: endDate,
          endDate: '2026-06-01T00:00:00.000Z',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(feeRecordRepo.createQueryBuilder).not.toHaveBeenCalled();
      expect(feeReportRepo.save).not.toHaveBeenCalled();
    });

    it('sums a single currency with 8dp precision from Big.js', async () => {
      recordQb.getRawMany.mockResolvedValue([
        { currency: 'USD', total: '0.123456789' },
      ]);

      const report = await service.generate('user-1', {
        period: 'daily',
        endDate,
      });

      expect(recordQb.andWhere).toHaveBeenCalledWith(
        'f.createdAt BETWEEN :startDate AND :endDate',
        dateParams(),
      );
      expect(report.feeBreakdown).toEqual({ USD: '0.12345679' });
      expect(report.totalFees).toBe(0.12345679);
    });

    it('keeps per-currency totals separate and zeroes the cross-currency total', async () => {
      recordQb.getRawMany.mockResolvedValue([
        { currency: 'USD', total: '1.5' },
        { currency: 'EUR', total: '2.25' },
      ]);

      const report = await service.generate('user-1', {
        period: 'weekly',
        endDate,
      });

      expect(report.feeBreakdown).toEqual({
        USD: '1.50000000',
        EUR: '2.25000000',
      });
      expect(report.totalFees).toBe(0);
    });

    it('normalises a null aggregate to an 8dp zero', async () => {
      recordQb.getRawMany.mockResolvedValue([{ currency: 'USD', total: null }]);

      const report = await service.generate('user-1', {
        period: 'daily',
        endDate,
      });

      expect(report.feeBreakdown).toEqual({ USD: '0.00000000' });
    });

    it('persists the report for the requesting user', async () => {
      const report = await service.generate('user-1', {
        period: 'daily',
        endDate,
      });

      expect(feeReportRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', period: 'daily' }),
      );
      const created = feeReportRepo.create.mock.calls[0]?.[0] as {
        generatedAt: Date;
      };
      expect(created.generatedAt).toBeInstanceOf(Date);
      expect(feeReportRepo.save).toHaveBeenCalledTimes(1);
      expect(report.id).toBe('report-1');
    });
  });

  describe('findAll()', () => {
    it('uses default pagination and scopes rows to the user', async () => {
      const rows = [{ id: 'report-1' }] as FeeReportEntity[];
      reportQb.getManyAndCount.mockResolvedValue([rows, 3]);

      const result = await service.findAll('user-1', {});

      expect(feeReportRepo.createQueryBuilder).toHaveBeenCalledWith('fr');
      expect(reportQb.where).toHaveBeenCalledWith('fr.userId = :userId', {
        userId: 'user-1',
      });
      expect(reportQb.orderBy).toHaveBeenCalledWith('fr.generatedAt', 'DESC');
      expect(reportQb.skip).toHaveBeenCalledWith(0);
      expect(reportQb.take).toHaveBeenCalledWith(20);
      expect(reportQb.andWhere).not.toHaveBeenCalled();
      expect(result).toEqual({ data: rows, total: 3, page: 1, limit: 20 });
    });

    it('computes skip from custom page/limit and applies a period filter', async () => {
      await service.findAll('user-1', { page: 3, limit: 10, period: 'weekly' });

      expect(reportQb.skip).toHaveBeenCalledWith(20);
      expect(reportQb.take).toHaveBeenCalledWith(10);
      expect(reportQb.andWhere).toHaveBeenCalledWith('fr.period = :period', {
        period: 'weekly',
      });
    });
  });
});
