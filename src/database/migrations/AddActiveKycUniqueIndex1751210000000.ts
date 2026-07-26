import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddActiveKycUniqueIndex1751210000000
  implements MigrationInterface
{
  name = 'AddActiveKycUniqueIndex1751210000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_kyc_documents_active_user"
      ON "kyc_documents" ("userId")
      WHERE "status" = 'pending'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_kyc_documents_active_user"`);
  }
}
