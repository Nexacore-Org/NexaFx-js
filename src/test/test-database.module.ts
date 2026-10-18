import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

/**
 * Postgres TypeORM module for integration tests.
 * Connection is driven by TEST_DB_* env vars (sensible local defaults).
 * Use TypeOrmModule.forFeature([Entity]) in your test module to register entities.
 */
@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.TEST_DB_HOST ?? 'localhost',
      port: Number(process.env.TEST_DB_PORT ?? 5432),
      username: process.env.TEST_DB_USERNAME ?? 'postgres',
      password: process.env.TEST_DB_PASSWORD ?? 'postgres',
      database: process.env.TEST_DB_DATABASE ?? 'postgres',
      autoLoadEntities: true,
      synchronize: true,
      dropSchema: true,
      retryAttempts: 0,
    }),
  ],
  exports: [TypeOrmModule],
})
export class TestDatabaseModule {}
