import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlterIdempotencyKeyColumnToVarchar2551700000000002 implements MigrationInterface {
  name = 'AlterIdempotencyKeyColumnToVarchar2551700000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "idempotency_keys" ALTER COLUMN "key" TYPE character varying(255)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "idempotency_keys" ALTER COLUMN "key" TYPE text`,
    );
  }
}
