import { ConfigService } from '@nestjs/config';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { AmlDisposition, AmlRiskLevel } from './aml-screening.entity';
import { AmlScreeningService } from './aml-screening.service';

function build() {
  const repo = {
    create: jest.fn((v) => v),
    save: jest.fn(async (v) => v),
    findOne: jest.fn(),
  };
  const reviewRepo = {
    create: jest.fn((v) => v),
    save: jest.fn(async (v) => v),
  };
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'aml.highValueThresholdUsd') return 10000;
      if (key === 'aml.criticalValueThresholdUsd') return 50000;
      return undefined;
    }),
  } as unknown as ConfigService;
  const rates = { calculateConversion: jest.fn() };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new AmlScreeningService(
    repo as any,
    reviewRepo as any,
    config,
    rates as any,
    audit as any,
  );
  return { service, repo, reviewRepo, rates, audit };
}

const tx = {
  userId: 'user-1',
  transactionId: 'tx-1',
  amount: 12_000,
  currency: 'USD',
};

describe('AmlScreeningService USD thresholds', () => {
  it('flags a USD amount at the high-value threshold', async () => {
    const { service } = build();
    const result = await service.screenTransaction({ ...tx });
    expect(result.flags).toContain('high_value');
    expect(result.riskLevel).toBe(AmlRiskLevel.MEDIUM);
  });

  it('flags a USD amount at the critical threshold higher', async () => {
    const { service } = build();
    const result = await service.screenTransaction({ ...tx, amount: 50_000 });
    expect(result.riskLevel).toBe(AmlRiskLevel.HIGH);
    expect(result.riskScore).toBeGreaterThanOrEqual(60);
  });

  it('converts a foreign amount before comparing it with the USD threshold', async () => {
    const { service, rates } = build();
    rates.calculateConversion.mockResolvedValue({ convertedAmount: 60_000 });

    const result = await service.screenTransaction({ ...tx, currency: 'EUR' });

    expect(rates.calculateConversion).toHaveBeenCalledWith('EUR', 'USD', 12_000);
    expect(result.riskLevel).toBe(AmlRiskLevel.HIGH);
  });

  it('does not flag a small foreign amount that looks large in its own currency', async () => {
    const { service, rates } = build();
    rates.calculateConversion.mockResolvedValue({ convertedAmount: 12 });

    const result = await service.screenTransaction({
      ...tx,
      currency: 'NGN',
      amount: 20_000,
    });

    expect(result.flags).not.toContain('high_value');
    expect(result.riskLevel).toBe(AmlRiskLevel.LOW);
  });
});

describe('AmlScreeningService.review', () => {
  const screening = {
    id: 's-1',
    disposition: null,
    reviewedBy: null,
    reviewedAt: null,
    notes: null,
  };

  it('records the disposition, appends history and audits the decision', async () => {
    const { service, repo, reviewRepo, audit } = build();
    repo.findOne.mockResolvedValue({ ...screening });

    const result = await service.review(
      's-1',
      'admin-1',
      'cleared after review',
      AmlDisposition.CLEARED,
    );

    expect(result).toEqual(
      expect.objectContaining({
        disposition: AmlDisposition.CLEARED,
        reviewedBy: 'admin-1',
      }),
    );
    expect(reviewRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        screeningId: 's-1',
        reviewedBy: 'admin-1',
        disposition: AmlDisposition.CLEARED,
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'aml.screening.reviewed' }),
    );
  });

  it('refuses to overwrite an already reviewed screening', async () => {
    const { service, repo } = build();
    repo.findOne.mockResolvedValue({
      ...screening,
      disposition: AmlDisposition.ESCALATED,
    });

    await expect(
      service.review('s-1', 'admin-2', '', AmlDisposition.CLEARED),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('404s for an unknown screening', async () => {
    const { service, repo } = build();
    repo.findOne.mockResolvedValue(null);
    await expect(
      service.review('missing', 'admin-1', '', AmlDisposition.CLEARED),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
