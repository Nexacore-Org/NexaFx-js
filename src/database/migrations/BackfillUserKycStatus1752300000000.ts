import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `User.kycStatus` was never updated when a KYC document was reviewed, so every
 * user stayed `pending`. Derive it once from the existing documents using the
 * rule the application now applies: the latest decided document wins.
 */
export class BackfillUserKycStatus1752300000000 implements MigrationInterface {
  name = 'BackfillUserKycStatus1752300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "users" u
      SET "kycStatus" = latest.status
      FROM (
        SELECT DISTINCT ON ("userId")
          "userId",
          CASE WHEN "status" = 'approved' THEN 'approved' ELSE 'rejected' END AS status
        FROM "kyc_documents"
        WHERE "status" IN ('approved', 'rejected')
        ORDER BY "userId", "reviewedAt" DESC NULLS LAST
      ) latest
      WHERE u."id" = latest."userId"
    `);
  }

  public async down(): Promise<void> {
    // The previous (incorrect) values cannot be reconstructed.
  }
}
