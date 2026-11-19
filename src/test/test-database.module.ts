import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildTestDatabaseOptions } from '../config/test-database-options';

/**
 * Postgres TypeORM module for integration tests.
 * Connection is driven by TEST_DB_* env vars. TEST_DB_DATABASE is required and must
 * end in `_test` / `-test` because this module drops the schema (issue #1545).
 * Use TypeOrmModule.forFeature([Entity]) in your test module to register entities.
 * Excluded from the production build (tsconfig.build.json).
 */
@Module({
  // Async so the safety check runs when the module is instantiated, not when the file is imported.
  imports: [TypeOrmModule.forRootAsync({ useFactory: () => buildTestDatabaseOptions() })],
  exports: [TypeOrmModule],
})
export class TestDatabaseModule {}
