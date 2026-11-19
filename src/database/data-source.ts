import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { buildPostgresConnectionOptions } from '../config/database-options';

const isTs = __filename.endsWith('.ts');

export const AppDataSource = new DataSource({
  type: 'postgres',
  ...buildPostgresConnectionOptions(),
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
  entities: isTs
    ? ['src/**/*.entity.ts']
    : [__dirname + '/../**/*.entity.js'],
  migrations: isTs
    ? ['src/database/migrations/*.ts']
    : [__dirname + '/migrations/*.js'],
  migrationsTableName: 'typeorm_migrations',
});

