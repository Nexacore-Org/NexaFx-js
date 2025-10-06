import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlterUserNotificationPreferencesColumn1701234567891
  implements MigrationInterface
{
  name = 'AlterUserNotificationPreferencesColumn1701234567891';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // First, convert existing JSON strings to proper JSON objects
    await queryRunner.query(`
      UPDATE users 
      SET "notificationPreferences" = CASE 
        WHEN "notificationPreferences" IS NOT NULL AND "notificationPreferences" != '' 
        THEN "notificationPreferences"::jsonb
        ELSE NULL
      END
    `);

    // Then alter the column type from text to jsonb
    await queryRunner.query(`
      ALTER TABLE users 
      ALTER COLUMN "notificationPreferences" TYPE jsonb 
      USING "notificationPreferences"::jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Convert jsonb back to text
    await queryRunner.query(`
      ALTER TABLE users 
      ALTER COLUMN "notificationPreferences" TYPE text 
      USING "notificationPreferences"::text
    `);
  }
}
