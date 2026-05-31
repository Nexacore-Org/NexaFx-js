import 'reflect-metadata';
import { DataSource } from 'typeorm';

const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'nexafx_dev',
  synchronize: false,
  logging: false,
});

const CURRENCIES = [
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'GBP', name: 'British Pound', symbol: '£' },
  { code: 'NGN', name: 'Nigerian Naira', symbol: '₦' },
];

const ROLES = ['admin', 'user', 'compliance'];

async function seed(): Promise<void> {
  await dataSource.initialize();
  const queryRunner = dataSource.createQueryRunner();

  try {
    await queryRunner.connect();
    await queryRunner.startTransaction();

    // Currencies
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS currencies (
        code VARCHAR(10) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        symbol VARCHAR(10) NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    for (const currency of CURRENCIES) {
      await queryRunner.query(
        `INSERT INTO currencies (code, name, symbol)
         VALUES ($1, $2, $3)
         ON CONFLICT (code) DO NOTHING`,
        [currency.code, currency.name, currency.symbol],
      );
    }

    // Roles
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS roles (
        name VARCHAR(50) PRIMARY KEY,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    for (const role of ROLES) {
      await queryRunner.query(
        `INSERT INTO roles (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`,
        [role],
      );
    }

    // System configuration defaults
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS system_config (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT NOT NULL,
        "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    const defaults: Array<[string, string]> = [
      ['maintenance_mode', 'false'],
      ['max_daily_transfer_usd', '50000'],
      ['supported_currencies', CURRENCIES.map((c) => c.code).join(',')],
    ];

    for (const [key, value] of defaults) {
      await queryRunner.query(
        `INSERT INTO system_config (key, value)
         VALUES ($1, $2)
         ON CONFLICT (key) DO NOTHING`,
        [key, value],
      );
    }

    await queryRunner.commitTransaction();
    console.log('Seed completed successfully');
  } catch (err) {
    await queryRunner.rollbackTransaction();
    console.error('Seed failed:', err);
    process.exit(1);
  } finally {
    await queryRunner.release();
    await dataSource.destroy();
  }
}

seed();
