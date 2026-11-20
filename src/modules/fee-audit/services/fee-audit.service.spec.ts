import { FeeAuditLogEntity } from '../entities/fee-audit-log.entity';
import { FeeAuditService } from './fee-audit.service';

const makeQueryBuilder = (items: FeeAuditLogEntity[] = [], total = 0) => {
  const qb: Record<string, jest.Mock> = {};
  qb.andWhere = jest.fn().mockReturnValue(qb);
  qb.orderBy = jest.fn().mockReturnValue(qb);
  qb.take = jest.fn().mockReturnValue(qb);
  qb.skip = jest.fn().mockReturnValue(qb);
  qb.getManyAndCount = jest.fn().mockResolvedValue([items, total]);
  return qb;
};

describe('FeeAuditService', () => {
  let auditRepo: {
    create: jest.Mock;
    save: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let qb: ReturnType<typeof makeQueryBuilder>;
  let service: FeeAuditService;

  beforeEach(() => {
    qb = makeQueryBuilder();
    auditRepo = {
      create: jest.fn((input: Record<string, unknown>) => ({
        id: 'audit-1',
        ...input,
      })),
      save: jest.fn((record: FeeAuditLogEntity) => Promise.resolve(record)),
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    };
    service = new FeeAuditService(auditRepo as never);
  });

  describe('recordFeeCalculation()', () => {
    it('creates and saves an audit row with the full payload', async () => {
      const params = {
        transactionId: 'tx-1',
        userId: 'user-1',
        feeAmount: 1.25,
        feeCurrency: 'USD',
        feeType: 'percentage' as const,
        calculatedAmount: 250,
        appliedTier: 'flat',
      };

      const saved = await service.recordFeeCalculation(params);

      expect(auditRepo.create).toHaveBeenCalledWith(params);
      expect(auditRepo.save).toHaveBeenCalledTimes(1);
      expect(saved).toMatchObject({ id: 'audit-1', ...params });
    });

    it('keeps optional fields undefined when they are omitted', async () => {
      await service.recordFeeCalculation({
        feeAmount: 0,
        feeCurrency: 'EUR',
        feeType: 'flat',
      });

      expect(auditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionId: undefined,
          userId: undefined,
          calculatedAmount: undefined,
          appliedTier: undefined,
        }),
      );
    });
  });

  describe('queryAuditTrail()', () => {
    it('uses page 1 / limit 20 by default and queries the log alias', async () => {
      const result = await service.queryAuditTrail({});

      expect(auditRepo.createQueryBuilder).toHaveBeenCalledWith('log');
      expect(qb.skip).toHaveBeenCalledWith(0);
      expect(qb.take).toHaveBeenCalledWith(20);
      expect(result.meta).toEqual({
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
      });
    });

    it('computes the offset from page and limit', async () => {
      qb.getManyAndCount.mockResolvedValue([[], 46]);
      const result = await service.queryAuditTrail({ page: 3, limit: 15 });

      expect(qb.skip).toHaveBeenCalledWith(30);
      expect(qb.take).toHaveBeenCalledWith(15);
      expect(result.meta).toEqual({
        page: 3,
        limit: 15,
        total: 46,
        totalPages: 4,
      });
    });

    it.each([
      [0, 0, 20],
      [2, 40, 20],
      [3, 41, 20],
      [2, 100, 50],
      [1, 1, 1],
    ])(
      'returns totalPages %p for total %p and limit %p',
      async (totalPages, total, limit) => {
        qb.getManyAndCount.mockResolvedValue([[], total]);

        const result = await service.queryAuditTrail({ limit });

        expect(result.meta.totalPages).toBe(totalPages);
      },
    );

    it('applies userId, transactionId and feeType filters', async () => {
      await service.queryAuditTrail({
        userId: 'user-1',
        transactionId: 'tx-1',
        feeType: 'flat',
      });

      expect(qb.andWhere).toHaveBeenCalledWith('log.userId = :userId', {
        userId: 'user-1',
      });
      expect(qb.andWhere).toHaveBeenCalledWith(
        'log.transactionId = :transactionId',
        {
          transactionId: 'tx-1',
        },
      );
      expect(qb.andWhere).toHaveBeenCalledWith('log.feeType = :feeType', {
        feeType: 'flat',
      });
    });

    it('applies only the filters that were supplied', async () => {
      await service.queryAuditTrail({ userId: 'user-1' });

      expect(qb.andWhere).toHaveBeenCalledTimes(1);
      expect(qb.andWhere).toHaveBeenCalledWith('log.userId = :userId', {
        userId: 'user-1',
      });
    });

    it('orders by creation date descending', async () => {
      await service.queryAuditTrail({});

      expect(qb.orderBy).toHaveBeenCalledWith('log.createdAt', 'DESC');
    });

    it('returns the rows from getManyAndCount', async () => {
      const rows = [{ id: 'audit-1' }] as FeeAuditLogEntity[];
      qb.getManyAndCount.mockResolvedValue([rows, 1]);

      const result = await service.queryAuditTrail({});

      expect(qb.getManyAndCount).toHaveBeenCalledTimes(1);
      expect(result.data).toEqual(rows);
    });
  });
});
