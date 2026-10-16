import { BadRequestException } from '@nestjs/common';
import { AdminService } from './admin.service';

function qb(rows: unknown[], one?: unknown) {
  const chain: any = {};
  for (const m of ['select', 'addSelect', 'where', 'andWhere', 'groupBy']) chain[m] = jest.fn(() => chain);
  chain.getRawMany = jest.fn().mockResolvedValue(rows);
  chain.getRawOne = jest.fn().mockResolvedValue(one);
  return chain;
}

function build(opts: { rows?: unknown[]; rate?: number | Error } = {}) {
  const txRepo = { createQueryBuilder: jest.fn(() => qb(opts.rows ?? [])) };
  const kycRepo = { createQueryBuilder: jest.fn(() => qb([], { count: '7' })) };
  const alertsRepo = { count: jest.fn().mockResolvedValue(3) };
  const rates = {
    getRate: jest.fn(async () => {
      if (opts.rate instanceof Error) throw opts.rate;
      return { rate: opts.rate ?? 0.001 };
    }),
  };
  const service = new AdminService(
    {} as any, txRepo as any, kycRepo as any, {} as any, {} as any, alertsRepo as any, {} as any,
    { log: jest.fn() } as any, undefined as any, rates as any,
  );
  return { service, txRepo, kycRepo, alertsRepo, rates };
}

describe('AdminService.generateCbnComplianceReport (#1357)', () => {
  it('computes the window from the requested period', () => {
    const { service } = build();
    const now = new Date('2026-05-17T10:00:00Z');
    expect(service.cbnReportWindow('monthly', undefined, now)).toEqual({
      from: new Date('2026-05-01T00:00:00Z'),
      to: new Date('2026-06-01T00:00:00Z'),
    });
    expect(service.cbnReportWindow('quarterly', undefined, now)).toEqual({
      from: new Date('2026-04-01T00:00:00Z'),
      to: new Date('2026-07-01T00:00:00Z'),
    });
    expect(service.cbnReportWindow('monthly', '2026-02-01')).toEqual({
      from: new Date('2026-02-01T00:00:00Z'),
      to: new Date('2026-03-01T00:00:00Z'),
    });
  });

  it('reports real counts and a per-currency breakdown, with no literals', async () => {
    const { service } = build({
      rows: [
        { currency: 'USD', count: '2', volume: '150.5' },
        { currency: 'NGN', count: '3', volume: '1000000' },
      ],
      rate: 0.001,
    });
    const report = await service.generateCbnComplianceReport('monthly', '2026-02-01');

    expect(report.metrics.totalTransactionsCount).toBe(5);
    expect(report.metrics.flaggedAmlIncidents).toBe(3);
    expect(report.metrics.kycApprovedUsersCount).toBe(7);
    expect(report.metrics.totalTransactionVolumeUsd).toBe(1150.5);
    expect(report.metrics.usdVolumeComplete).toBe(true);
    expect(report.currencyBreakdown).toEqual([
      expect.objectContaining({ currency: 'USD', usdRate: 1, volumeUsd: 150.5 }),
      expect.objectContaining({ currency: 'NGN', usdRate: 0.001, volumeUsd: 1000 }),
    ]);
    expect(report.window.from).toBe('2026-02-01T00:00:00.000Z');
  });

  it('lists currencies it cannot convert instead of inventing a rate', async () => {
    const { service } = build({ rows: [{ currency: 'XYZ', count: '1', volume: '10' }], rate: new Error('no rate') });
    const report = await service.generateCbnComplianceReport();
    expect(report.metrics.usdVolumeComplete).toBe(false);
    expect(report.metrics.unconvertedCurrencies).toEqual(['XYZ']);
    expect(report.currencyBreakdown[0].volumeUsd).toBeNull();
  });
});

describe('AdminService.findAllTransactions date validation (#1357)', () => {
  const service = () => {
    const chain: any = {};
    for (const m of ['leftJoinAndSelect', 'orderBy', 'skip', 'take', 'andWhere']) chain[m] = jest.fn(() => chain);
    chain.getManyAndCount = jest.fn().mockResolvedValue([[], 0]);
    return new AdminService(
      {} as any, { createQueryBuilder: () => chain } as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
    );
  };

  it('rejects unparsable dates with 400 instead of reaching the database', async () => {
    await expect(service().findAllTransactions({ startDate: 'garbage' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects startDate after endDate with 400', async () => {
    await expect(
      service().findAllTransactions({ startDate: '2026-02-01', endDate: '2026-01-01' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
