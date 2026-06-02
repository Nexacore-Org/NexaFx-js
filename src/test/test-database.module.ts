import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

/**
 * In-memory SQLite TypeORM module for integration tests.
 * Each test suite that imports this gets an isolated, empty database.
 * Use TypeOrmModule.forFeature([Entity]) in your test module to register entities.
 */
@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: ':memory:',
      autoLoadEntities: true,
      synchronize: true,
      dropSchema: true,
    }),
  ],
  exports: [TypeOrmModule],
})
export class TestDatabaseModule {}
