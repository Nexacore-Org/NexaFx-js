import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { buildPostgresConnectionOptions } from '../config/database-options';

export const AppDataSource = new DataSource({
  type: 'postgres',
  ...buildPostgresConnectionOptions(),
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/database/migrations/*.ts'],
  migrationsTableName: 'typeorm_migrations',
});

