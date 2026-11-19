import { ConfigService } from '@nestjs/config';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { AmlDisposition, AmlRiskLevel } from './aml-screening.entity';
import { AmlScreeningService } from './aml-screening.service';

function build() {
  const repo = {
    create: jest.fn((v: unknown) => v),
    save: jest.fn((v: unknown) => Promise.resolve(v)),
    findOne: jest.fn(),
  };
  const reviewRepo = {
    create: jest.fn((v: unknown) => v),
    save: jest.fn((v: unknown) => Promise.resolve(v)),
  };
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'aml.highValueThresholdUsd') return 10000;
      if (key === 'aml.criticalValueThresholdUsd') return 50000;
      return undefined;
    }),
  } as unknown as ConfigService;
  const rates = { calculateConversion: jest.fn() };
  const watchlist = {
    getEntries: jest.fn(() => [
      { name: 'Vladimir Putin', type: 'sanctions' },
      {
        name: 'Ali Hosseini Mehrbadi',
        type: 'sanctions',
        dateOfBirth: '1967-01-01',
      },
      { name: 'Jane Doe', type: 'pep' },
    ]),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new AmlScreeningService(
    repo as any,
    reviewRepo as any,
    config,
    rates as any,
    watchlist as any,
    audit as any,
  );
  return { service, repo, reviewRepo, rates, audit, watchlist };
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

    expect(rates.calculateConversion).toHaveBeenCalledWith(
      'EUR',
      'USD',
      12_000,
    );
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

describe('AmlScreeningService watchlist matching', () => {
  it.each([
    'Kingsley Okafor',
    'Queenie Adeyemi',
    'General Ibrahim',
    'Prince Sultana',
  ])('does not flag the substring-only false positive %s', async (fullName) => {
    const { service, repo, watchlist } = build();
    const result = await service.screenUser({ userId: 'user-1', fullName });

    expect(watchlist.getEntries).toHaveBeenCalled();
    expect(result.flags).toEqual([]);
    expect(result.riskLevel).toBe(AmlRiskLevel.LOW);
    expect(result.matchDetails).toEqual([]);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ matchDetails: [] }),
    );
  });

  it.each(['putin vladimir', 'Vladímir Pútin', 'Vladimir-Putin'])(
    'flags the sanctioned name variant %s',
    async (fullName) => {
      const { service, repo } = build();
      const result = await service.screenUser({ userId: 'user-1', fullName });

      expect(result.flags).toContain('sanctions_match');
      expect(result.riskScore).toBe(50);
      expect(result.riskLevel).toBe(AmlRiskLevel.HIGH);
      expect(result.matchDetails).toEqual([
        expect.objectContaining({
          list: 'sanctions',
          matchedName: 'Vladimir Putin',
          candidateName: fullName,
          score: 1,
        }),
      ]);
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          matchDetails: expect.arrayContaining([
            expect.objectContaining({ matchedName: 'Vladimir Putin' }),
          ]) as unknown[],
        }),
      );
    },
  );

  it('does not flag a near miss below the similarity threshold', async () => {
    const { service } = build();
    const result = await service.screenUser({
      userId: 'user-1',
      fullName: 'Vladimir Putinkin',
    });

    expect(result.flags).toEqual([]);
    expect(result.riskLevel).toBe(AmlRiskLevel.LOW);
  });

  it('flags a named PEP entry without treating job titles as PEPs', async () => {
    const { service } = build();
    const result = await service.screenUser({
      userId: 'user-1',
      fullName: 'Jane Doe',
    });

    expect(result.flags).toContain('pep');
    expect(result.flags).not.toContain('sanctions_match');
    expect(result.riskScore).toBe(30);
    expect(result.matchDetails[0].list).toBe('pep');
  });

  it('ignores a conflicting date of birth but corroborates a matching one', async () => {
    const { service } = build();
    const mismatched = await service.screenUser({
      userId: 'user-1',
      fullName: 'Ali Hosseini Mehrbadi',
      dateOfBirth: '1970-01-01',
    });
    const matched = await service.screenUser({
      userId: 'user-1',
      fullName: 'Ali Hosseini Mehrbadi',
      dateOfBirth: '1967-01-01',
    });

    expect(mismatched.flags).toEqual([]);
    expect(matched.flags).toContain('sanctions_match');
    expect(matched.matchDetails[0]).toEqual(
      expect.objectContaining({ dateOfBirthConfirmed: true }),
    );
  });

  it('honours a configured similarity threshold', async () => {
    const { repo } = build();
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'aml.screeningSimilarityThreshold') return 0.99;
        return undefined;
      }),
    } as unknown as ConfigService;
    const strict = new AmlScreeningService(
      repo as any,
      {} as any,
      config,
      {} as any,
      {
        getEntries: () => [{ name: 'Vladimir Putin', type: 'sanctions' }],
      } as any,
    );

    const result = await strict.screenUser({
      userId: 'user-1',
      fullName: 'Vladimir Putinkin',
    });
    expect(result.flags).toEqual([]);
  });

  it('screens counterparties in transactions and persists match details', async () => {
    const { service, repo } = build();
    const result = await service.screenTransaction({
      ...tx,
      counterpartyName: 'Vladimir-Putin',
    });

    expect(result.flags).toEqual(
      expect.arrayContaining(['high_value', 'sanctions_match']),
    );
    expect(result.riskScore).toBe(80);
    expect(result.riskLevel).toBe(AmlRiskLevel.CRITICAL);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        matchDetails: expect.arrayContaining([
          expect.objectContaining({ matchedName: 'Vladimir Putin' }),
        ]) as unknown[],
      }),
    );
  });
});
