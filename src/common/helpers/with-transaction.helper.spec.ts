import { DataSource, EntityManager } from 'typeorm';
import { withTransaction } from './with-transaction.helper';

describe('withTransaction', () => {
  it('commits a successful transaction', async () => {
    const manager = {} as EntityManager;
    const queryRunner = {
      manager,
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      isTransactionActive: true,
    };
    const dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(queryRunner),
    } as unknown as DataSource;

    const result = await withTransaction(dataSource, async (receivedManager) => {
      expect(receivedManager).toBe(manager);
      return 'ok';
    });

    expect(result).toBe('ok');
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });

  it('rolls back when the callback throws', async () => {
    const queryRunner = {
      manager: {} as EntityManager,
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      isTransactionActive: true,
    };
    const dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(queryRunner),
    } as unknown as DataSource;

    await expect(
      withTransaction(dataSource, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });
});
