import { CURRENCY_PAIRS, seed } from './seed';
import { DataSource } from 'typeorm';

const buildDs = (queryImpl: jest.Mock = jest.fn().mockResolvedValue([])) => {
  const runner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    isTransactionActive: true,
    query: queryImpl,
  };
  const ds = {
    isInitialized: true,
    initialize: jest.fn(),
    destroy: jest.fn(),
    createQueryRunner: jest.fn().mockReturnValue(runner),
  } as unknown as DataSource;
  return { ds, runner };
};

describe('seed script', () => {
  it('seeds only currency_pairs and creates no tables (issue #1542)', async () => {
    const { ds, runner } = buildDs();

    await seed(ds);

    const statements = runner.query.mock.calls.map((c) => String(c[0]));
    expect(statements).toHaveLength(CURRENCY_PAIRS.length);
    expect(statements.every((q) => q.includes('currency_pairs'))).toBe(true);
    expect(statements.some((q) => /CREATE TABLE/i.test(q))).toBe(false);
    expect(runner.commitTransaction).toHaveBeenCalled();
  });

  it('is idempotent via ON CONFLICT on the migrated unique constraint', async () => {
    const { ds, runner } = buildDs();

    await seed(ds);

    expect(String(runner.query.mock.calls[0][0])).toContain('ON CONFLICT ("fromCurrency", "toCurrency")');
  });

  it('rolls back and rethrows instead of exiting the process', async () => {
    const exit = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const { ds, runner } = buildDs(jest.fn().mockRejectedValue(new Error('boom')));

    await expect(seed(ds)).rejects.toThrow('boom');

    expect(runner.rollbackTransaction).toHaveBeenCalled();
    expect(runner.release).toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
    exit.mockRestore();
  });

  it('does not destroy a data source it did not initialize', async () => {
    const { ds } = buildDs();

    await seed(ds);

    expect((ds as unknown as { destroy: jest.Mock }).destroy).not.toHaveBeenCalled();
  });
});
