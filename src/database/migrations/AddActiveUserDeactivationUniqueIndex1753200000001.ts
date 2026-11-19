import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Issue #1523: at most one active deactivation record per user. Two concurrent
 * requests used to both pass the `findOne` check and create two active rows
 * (compare `uq_account_freezes_active_user`).
 */
export class AddActiveUserDeactivationUniqueIndex1753200000001 implements MigrationInterface {
  name = 'AddActiveUserDeactivationUniqueIndex1753200000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Collapse existing duplicates, keeping the newest active record per user.
    await queryRunner.query(`
      UPDATE "user_deactivations" d
      SET "isActive" = false, "reactivatedAt" = COALESCE(d."reactivatedAt", now())
      WHERE d."isActive" = true
        AND d."id" <> (
          SELECT d2."id" FROM "user_deactivations" d2
          WHERE d2."userId" = d."userId" AND d2."isActive" = true
          ORDER BY d2."deactivatedAt" DESC, d2."id" DESC
          LIMIT 1
        )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_user_deactivations_active_user" ON "user_deactivations" ("userId") WHERE "isActive" = true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_user_deactivations_active_user"`);
  }
}
