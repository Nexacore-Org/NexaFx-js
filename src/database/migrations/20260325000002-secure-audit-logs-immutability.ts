import { MigrationInterface, QueryRunner } from 'typeorm';

export class SecureAuditLogsImmutability20260325000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create a restricted role that can only read audit logs
    await queryRunner.query(`
      CREATE ROLE audit_readonly;
      
      -- Grant read-only access to admin_audit_logs table
      GRANT SELECT ON admin_audit_logs TO audit_readonly;
      
      -- Grant usage on the sequence for the ID column
      GRANT USAGE ON SEQUENCE admin_audit_logs_id_seq TO audit_readonly;
    `);

    // Create a function to prevent updates and deletes on audit logs
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION prevent_audit_modification()
      RETURNS TRIGGER AS $$
      BEGIN
        IF TG_OP = 'DELETE' THEN
          RAISE EXCEPTION 'Audit logs cannot be deleted. Records are immutable.';
        ELSIF TG_OP = 'UPDATE' THEN
          RAISE EXCEPTION 'Audit logs cannot be updated. Records are immutable.';
        END IF;
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Create triggers to prevent modification
    await queryRunner.query(`
      CREATE TRIGGER audit_logs_prevent_delete
        BEFORE DELETE ON admin_audit_logs
        FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();
        
      CREATE TRIGGER audit_logs_prevent_update
        BEFORE UPDATE ON admin_audit_logs
        FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();
    `);

    // Add additional indexes for performance as specified in requirements
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_admin_audit_composite 
        ON admin_audit_logs (actorId, createdAt, action);
        
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_admin_audit_created_at_desc 
        ON admin_audit_logs (createdAt DESC);
        
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_admin_audit_entity_created 
        ON admin_audit_logs (entity, createdAt DESC);
    `);

    // Add comment to document immutability
    await queryRunner.query(`
      COMMENT ON TABLE admin_audit_logs IS 
        'Immutable audit log table. Records cannot be updated or deleted once created.';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop triggers
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS audit_logs_prevent_delete ON admin_audit_logs;
      DROP TRIGGER IF EXISTS audit_logs_prevent_update ON admin_audit_logs;
    `);

    // Drop the function
    await queryRunner.query(`
      DROP FUNCTION IF EXISTS prevent_audit_modification();
    `);

    // Drop the role
    await queryRunner.query(`
      DROP ROLE IF EXISTS audit_readonly;
    `);

    // Drop additional indexes (but keep the original ones from the first migration)
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_admin_audit_composite;
      DROP INDEX IF EXISTS idx_admin_audit_created_at_desc;
      DROP INDEX IF EXISTS idx_admin_audit_entity_created;
    `);

    // Remove comment
    await queryRunner.query(`
      COMMENT ON TABLE admin_audit_logs IS NULL;
    `);
  }
}
