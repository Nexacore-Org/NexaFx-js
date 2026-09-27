import { CURRENCIES, ROLES, seed } from './seed';
import { DataSource } from 'typeorm';

describe('seed script', () => {
  it('contains expected currencies and roles', () => {
    expect(ROLES).toContain('admin');
    expect(CURRENCIES.map((c) => c.code)).toContain('USD');
  });

  it('seed function initiates connection and runs queries', async () => {
    const mockQuery = jest.fn().mockResolvedValue([]);
    const mockQueryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      query: mockQuery,
    };
    const mockDataSource = {
      isInitialized: true,
      initialize: jest.fn(),
      destroy: jest.fn(),
      createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
    } as unknown as DataSource;

    await seed(mockDataSource);
    expect(mockQueryRunner.connect).toHaveBeenCalled();
    expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
  });
});
