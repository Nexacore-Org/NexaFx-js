import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixTimelineEntryUniqueConstraint1701234567891
  implements MigrationInterface
{
  name = 'FixTimelineEntryUniqueConstraint1701234567891';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the existing unique constraint on disputeId, type, payload
    await queryRunner.query(`
      ALTER TABLE "timeline_entries" 
      DROP CONSTRAINT IF EXISTS "UQ_timeline_entries_disputeId_type_payload"
    `);

    // Add the new payload_hash column
    await queryRunner.query(`
      ALTER TABLE "timeline_entries" 
      ADD COLUMN "payloadHash" varchar(64)
    `);

    // Create index on payloadHash for performance
    await queryRunner.query(`
      CREATE INDEX "IDX_timeline_entries_payloadHash" 
      ON "timeline_entries" ("payloadHash")
    `);

    // Populate payloadHash for existing records
    // This will compute SHA256 hash of the JSONB payload
    await queryRunner.query(`
      UPDATE "timeline_entries" 
      SET "payloadHash" = encode(digest(payload::text, 'sha256'), 'hex')
      WHERE "payloadHash" IS NULL
    `);

    // Make payloadHash NOT NULL after populating existing data
    await queryRunner.query(`
      ALTER TABLE "timeline_entries" 
      ALTER COLUMN "payloadHash" SET NOT NULL
    `);

    // Add the new unique constraint on disputeId, type, payloadHash
    await queryRunner.query(`
      ALTER TABLE "timeline_entries" 
      ADD CONSTRAINT "UQ_timeline_entries_disputeId_type_payloadHash" 
      UNIQUE ("disputeId", "type", "payloadHash")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop the new unique constraint
    await queryRunner.query(`
      ALTER TABLE "timeline_entries" 
      DROP CONSTRAINT IF EXISTS "UQ_timeline_entries_disputeId_type_payloadHash"
    `);

    // Drop the payloadHash index
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_timeline_entries_payloadHash"
    `);

    // Drop the payloadHash column
    await queryRunner.query(`
      ALTER TABLE "timeline_entries" 
      DROP COLUMN IF EXISTS "payloadHash"
    `);

    // Recreate the old unique constraint (if needed)
    // Note: This might fail if there are duplicate entries
    await queryRunner.query(`
      ALTER TABLE "timeline_entries" 
      ADD CONSTRAINT "UQ_timeline_entries_disputeId_type_payload" 
      UNIQUE ("disputeId", "type", "payload")
    `);
  }
}
