import { acquireMigrationLock } from './migration-lock';
import { DataSource } from 'typeorm';

describe('migration-lock', () => {
  it('acquires and releases advisory lock', async () => {
    const mockQuery = jest.fn().mockResolvedValue([]);
    const mockDataSource = { query: mockQuery } as unknown as DataSource;

    const release = await acquireMigrationLock(mockDataSource);
    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT pg_advisory_lock(193847582)',
    );

    await release();
    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT pg_advisory_unlock(193847582)',
    );
  });
});
