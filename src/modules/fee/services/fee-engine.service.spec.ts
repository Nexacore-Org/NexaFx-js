import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { FeeEngineService } from './fee-engine.service';
import { FeeRuleEntity } from '../entities/fee-rule.entity';

const mockRule = (overrides: Partial<FeeRuleEntity> = {}): FeeRuleEntity =>
  ({
    id: 'rule-1',
    ruleType: 'PERCENTAGE',
    currency: 'USD',
    percentage: 2,
    flatFee: null,
    priority: 10,
    isActive: true,
    promoCode: null,
    expiresAt: null,
    minAmount: null,
    maxAmount: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as FeeRuleEntity;

describe('FeeEngineService', () => {
  let service: FeeEngineService;
  const mockRuleRepo = { createQueryBuilder: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeeEngineService,
        { provide: getRepositoryToken(FeeRuleEntity), useValue: mockRuleRepo },
      ],
    }).compile();

    service = module.get<FeeEngineService>(FeeEngineService);
  });

  const setupQb = (rules: FeeRuleEntity[]) => {
    const qb: any = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(rules),
    };
    mockRuleRepo.createQueryBuilder.mockReturnValue(qb);
    return qb;
  };

  it('returns null when no rule matches', async () => {
    setupQb([]);
    const result = await service.evaluate(100, 'USD');
    expect(result).toBeNull();
  });

  it('calculates percentage fee correctly', async () => {
    setupQb([mockRule()]);
    const result = await service.evaluate(1000, 'USD');
    expect(result?.feeAmount).toBe(20); // 2% of 1000
  });

  it('calculates flat fee correctly', async () => {
    setupQb([mockRule({ ruleType: 'FLAT', percentage: null, flatFee: 5 })]);
    const result = await service.evaluate(500, 'USD');
    expect(result?.feeAmount).toBe(5);
  });

  it('combines percentage and flat fee', async () => {
    setupQb([mockRule({ percentage: 1, flatFee: 2 })]);
    const result = await service.evaluate(200, 'USD');
    expect(result?.feeAmount).toBe(4); // 1% of 200 + 2 flat
  });

  it('promotional code selects promo rule over standard', async () => {
    const standard = mockRule({ id: 'standard', priority: 5 });
    const promo = mockRule({
      id: 'promo',
      ruleType: 'PROMOTIONAL',
      promoCode: 'SAVE10',
      percentage: 0.5,
      priority: 50,
    });
    setupQb([standard, promo]);
    const result = await service.evaluate(100, 'USD', 'SAVE10');
    expect(result?.ruleId).toBe('promo');
    expect(result?.feeAmount).toBe(0.5);
  });

  it('simulate returns total amount including fee', async () => {
    setupQb([mockRule()]);
    const result = await service.simulate({ amount: 100, currency: 'USD' });
    expect(result.totalAmount).toBe(102);
  });
});
