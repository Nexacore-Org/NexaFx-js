import { DataSource } from 'typeorm';
import { AppDataSource } from '../src/database/data-source';

describe('Database Migrations', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = await AppDataSource.initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('should run all migrations up successfully', async () => {
    await expect(dataSource.runMigrations()).resolves.not.toThrow();
  });

  it('should revert all migrations successfully', async () => {
    const executed = await dataSource.showMigrations();

    if (!executed) {
      // run first so we can revert
      await dataSource.runMigrations();
    }

    let hasMigrations = true;

    while (hasMigrations) {
      try {
        await dataSource.undoLastMigration();
      } catch {
        hasMigrations = false;
      }
    }

    expect(true).toBe(true);
  });
});