import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnhanceAuditLogs20250224000000 implements MigrationInterface {
  name = 'EnhanceAuditLogs20250224000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add new columns for enhanced audit logging
    await queryRunner.query(`
      ALTER TABLE admin_audit_logs 
      ADD COLUMN IF NOT EXISTS actor_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS actor_type VARCHAR(50) DEFAULT 'user',
      ADD COLUMN IF NOT EXISTS before_snapshot JSONB,
      ADD COLUMN IF NOT EXISTS after_snapshot JSONB,
      ADD COLUMN IF NOT EXISTS user_agent VARCHAR(500),
      ADD COLUMN IF NOT EXISTS description VARCHAR(255)
    `);

    // Migrate existing data: copy admin_id to actor_id
    await queryRunner.query(`
      UPDATE admin_audit_logs 
      SET actor_id = admin_id,
          actor_type = 'admin'
      WHERE admin_id IS NOT NULL
    `);

    // Drop old admin_id column
    await queryRunner.query(`
      ALTER TABLE admin_audit_logs 
      DROP COLUMN IF EXISTS admin_id
    `);

    // Create new indexes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_admin_audit_actor_id ON admin_audit_logs(actor_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_admin_audit_actor_type ON admin_audit_logs(actor_type)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_admin_audit_entity ON admin_audit_logs(entity)
    `);

    // Drop old index if exists
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_admin_audit_admin_id
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Add back admin_id column
    await queryRunner.query(`
      ALTER TABLE admin_audit_logs 
      ADD COLUMN IF NOT EXISTS admin_id VARCHAR(255)
    `);

    // Migrate data back
    await queryRunner.query(`
      UPDATE admin_audit_logs 
      SET admin_id = actor_id
      WHERE actor_type = 'admin' AND actor_id IS NOT NULL
    `);

    // Drop new columns
    await queryRunner.query(`
      ALTER TABLE admin_audit_logs 
      DROP COLUMN IF EXISTS actor_id,
      DROP COLUMN IF EXISTS actor_type,
      DROP COLUMN IF EXISTS before_snapshot,
      DROP COLUMN IF EXISTS after_snapshot,
      DROP COLUMN IF EXISTS user_agent,
      DROP COLUMN IF EXISTS description
    `);

    // Restore old index
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_admin_audit_admin_id ON admin_audit_logs(admin_id)
    `);

    // Drop new indexes
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_admin_audit_actor_id
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_admin_audit_actor_type
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_admin_audit_entity
    `);
  }
}
