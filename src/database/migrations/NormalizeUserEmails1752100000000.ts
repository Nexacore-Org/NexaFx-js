import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Emails were case-sensitive, so `Alice@x.com` and `alice@x.com` could be two
 * accounts. This lower-cases/trims existing rows (failing loudly, with the
 * colliding addresses, if that would merge two accounts) and adds a functional
 * unique index on LOWER(email). The legacy case-sensitive unique constraint is
 * left in place: after normalisation it is redundant but harmless.
 */
export class NormalizeUserEmails1752100000000 implements MigrationInterface {
  name = 'NormalizeUserEmails1752100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const collisions: Array<{ normalized: string; count: string }> =
      await queryRunner.query(`
        SELECT LOWER(TRIM("email")) AS normalized, COUNT(*) AS count
        FROM "users"
        GROUP BY LOWER(TRIM("email"))
        HAVING COUNT(*) > 1
      `);

    if (collisions.length > 0) {
      const list = collisions.map((c) => `${c.normalized} (${c.count})`).join(', ');
      throw new Error(
        `Cannot normalise user emails: these addresses exist more than once ignoring case/whitespace: ${list}. ` +
          'Merge or rename the duplicate accounts, then re-run the migration.',
      );
    }

    await queryRunner.query(
      `UPDATE "users" SET "email" = LOWER(TRIM("email")) WHERE "email" <> LOWER(TRIM("email"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_users_email_lower" ON "users" (LOWER("email"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_users_email_lower"`);
    // Lower-cased addresses cannot be restored to their original casing.
  }
}
