import { MigrationInterface, QueryRunner } from 'typeorm';

export class AdvancedRbac1700000000001 implements MigrationInterface {
  name = 'AdvancedRbac1700000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Enums ────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE "permission_action_enum" AS ENUM (
        'create','read','update','delete','manage','execute','approve','reject','export','import'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "permission_resource_enum" AS ENUM (
        'user','role','permission','wallet','transaction','token',
        'admin','report','audit_log','system','*'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "rbac_audit_action_enum" AS ENUM (
        'ROLE_CREATED','ROLE_UPDATED','ROLE_DELETED',
        'PERMISSION_CREATED','PERMISSION_UPDATED','PERMISSION_DELETED',
        'ROLE_PERMISSION_ASSIGNED','ROLE_PERMISSION_REVOKED',
        'USER_ROLE_ASSIGNED','USER_ROLE_REVOKED',
        'ACCESS_GRANTED','ACCESS_DENIED'
      )
    `);

    // ── roles ────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "roles" (
        "id"          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        "name"        VARCHAR(100) NOT NULL,
        "description" VARCHAR(255),
        "priority"    INTEGER NOT NULL DEFAULT 0,
        "is_active"   BOOLEAN NOT NULL DEFAULT TRUE,
        "is_system"   BOOLEAN NOT NULL DEFAULT FALSE,
        "parent_id"   UUID REFERENCES "roles"("id") ON DELETE SET NULL,
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "uq_roles_name" UNIQUE ("name")
      )
    `);

    await queryRunner.query(`CREATE INDEX "idx_roles_parent_id" ON "roles" ("parent_id")`);

    // ── permissions ──────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "permissions" (
        "id"          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        "name"        VARCHAR(100) NOT NULL,
        "description" VARCHAR(255),
        "action"      "permission_action_enum"   NOT NULL,
        "resource"    "permission_resource_enum" NOT NULL,
        "scope"       VARCHAR(255),
        "conditions"  JSONB,
        "is_active"   BOOLEAN NOT NULL DEFAULT TRUE,
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "uq_permissions_action_resource_scope" UNIQUE ("action", "resource", "scope")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_permissions_resource" ON "permissions" ("resource")
    `);

    // ── role_permissions (junction) ───────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "role_permissions" (
        "role_id"       UUID NOT NULL REFERENCES "roles"("id") ON DELETE CASCADE,
        "permission_id" UUID NOT NULL REFERENCES "permissions"("id") ON DELETE CASCADE,
        PRIMARY KEY ("role_id", "permission_id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_role_permissions_permission_id" ON "role_permissions" ("permission_id")
    `);

    // ── user_roles (junction) ─────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "user_roles" (
        "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "role_id" UUID NOT NULL REFERENCES "roles"("id") ON DELETE CASCADE,
        PRIMARY KEY ("user_id", "role_id")
      )
    `);

    await queryRunner.query(`CREATE INDEX "idx_user_roles_role_id" ON "user_roles" ("role_id")`);

    // ── rbac_audit_logs ──────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "rbac_audit_logs" (
        "id"                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        "action"                "rbac_audit_action_enum" NOT NULL,
        "actor_id"              UUID REFERENCES "users"("id") ON DELETE SET NULL,
        "target_user_id"        UUID,
        "target_role_id"        UUID,
        "target_permission_id"  UUID,
        "previous_state"        JSONB,
        "new_state"             JSONB,
        "metadata"              JSONB,
        "ip_address"            VARCHAR(45),
        "user_agent"            TEXT,
        "created_at"            TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`CREATE INDEX "idx_rbac_audit_actor" ON "rbac_audit_logs" ("actor_id")`);
    await queryRunner.query(`CREATE INDEX "idx_rbac_audit_target_user" ON "rbac_audit_logs" ("target_user_id")`);
    await queryRunner.query(`CREATE INDEX "idx_rbac_audit_action" ON "rbac_audit_logs" ("action")`);
    await queryRunner.query(`CREATE INDEX "idx_rbac_audit_created_at" ON "rbac_audit_logs" ("created_at")`);

    // ── Seed system roles ─────────────────────────────────────────────────────
    await queryRunner.query(`
      INSERT INTO "roles" ("name","description","priority","is_system") VALUES
        ('SUPER_ADMIN', 'Unrestricted system access', 1000, TRUE),
        ('ADMIN',       'Administrative access',      900,  TRUE),
        ('MODERATOR',   'Content moderation',         500,  TRUE),
        ('USER',        'Standard user access',       100,  TRUE)
    `);

    // ── Seed core permissions ─────────────────────────────────────────────────
    await queryRunner.query(`
      INSERT INTO "permissions" ("name","action","resource") VALUES
        ('Manage All',          'manage', '*'),
        ('Manage Users',        'manage', 'user'),
        ('Read Users',          'read',   'user'),
        ('Create Roles',        'create', 'role'),
        ('Read Roles',          'read',   'role'),
        ('Update Roles',        'update', 'role'),
        ('Delete Roles',        'delete', 'role'),
        ('Manage Roles',        'manage', 'role'),
        ('Create Permissions',  'create', 'permission'),
        ('Read Permissions',    'read',   'permission'),
        ('Update Permissions',  'update', 'permission'),
        ('Delete Permissions',  'delete', 'permission'),
        ('Manage Permissions',  'manage', 'permission'),
        ('Read Audit Logs',     'read',   'audit_log'),
        ('Read Reports',        'read',   'report'),
        ('Export Reports',      'export', 'report'),
        ('Manage System',       'manage', 'system')
    `);

    // Assign manage:* to SUPER_ADMIN
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id","permission_id")
      SELECT r.id, p.id
      FROM "roles" r, "permissions" p
      WHERE r.name = 'SUPER_ADMIN' AND p.name = 'Manage All'
    `);

    // Assign role/user/permission management + audit to ADMIN
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id","permission_id")
      SELECT r.id, p.id
      FROM "roles" r, "permissions" p
      WHERE r.name = 'ADMIN'
        AND p.name IN (
          'Manage Users','Read Roles','Manage Roles',
          'Read Permissions','Manage Permissions','Read Audit Logs','Read Reports'
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "rbac_audit_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_roles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "role_permissions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "permissions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "roles"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "rbac_audit_action_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "permission_resource_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "permission_action_enum"`);
  }
}
