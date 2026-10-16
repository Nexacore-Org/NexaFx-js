import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Guarantee at most one active freeze per user. Two concurrent freeze requests
 * used to create two active rows, and a later unfreeze cleared only one.
 */
export class AddActiveAccountFreezeUniqueIndex1752000000000
  implements MigrationInterface
{
  name = 'AddActiveAccountFreezeUniqueIndex1752000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Collapse any existing duplicate active freezes, keeping the newest.
    await queryRunner.query(`
      UPDATE "account_freezes" af
      SET "isActive" = false, "unfrozenAt" = COALESCE(af."unfrozenAt", now())
      WHERE af."isActive" = true
        AND af."id" <> (
          SELECT a2."id" FROM "account_freezes" a2
          WHERE a2."userId" = af."userId" AND a2."isActive" = true
          ORDER BY a2."frozenAt" DESC, a2."id" DESC
          LIMIT 1
        )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_account_freezes_active_user" ON "account_freezes" ("userId") WHERE "isActive" = true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_account_freezes_active_user"`);
  }
}
