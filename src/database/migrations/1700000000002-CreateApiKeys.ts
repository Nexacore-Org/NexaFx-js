import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateApiKeys1700000000002 implements MigrationInterface {
  name = 'CreateApiKeys1700000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "api_key_status_enum" AS ENUM ('active', 'revoked', 'expired')
    `);

    await queryRunner.query(`
      CREATE TABLE "api_keys" (
        "id"            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        "name"          VARCHAR(100) NOT NULL,
        "prefix"        VARCHAR(8) NOT NULL,
        "hashed_key"    VARCHAR(64) NOT NULL,
        "scopes"        TEXT NOT NULL,
        "status"        "api_key_status_enum" NOT NULL DEFAULT 'active',
        "expires_at"    TIMESTAMPTZ,
        "last_used_at"  TIMESTAMPTZ,
        "rotated_at"    TIMESTAMPTZ,
        "rotated_to_id" UUID,
        "created_by"    UUID,
        "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"    TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`CREATE INDEX "idx_api_keys_prefix" ON "api_keys" ("prefix")`);
    await queryRunner.query(`CREATE INDEX "idx_api_keys_status" ON "api_keys" ("status")`);

    await queryRunner.query(`
      CREATE TABLE "api_key_usage_logs" (
        "id"              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        "api_key_id"      UUID NOT NULL REFERENCES "api_keys"("id") ON DELETE CASCADE,
        "endpoint"        VARCHAR(255) NOT NULL,
        "method"          VARCHAR(10) NOT NULL,
        "response_status" INTEGER,
        "latency_ms"      INTEGER,
        "ip_address"      VARCHAR(45),
        "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`CREATE INDEX "idx_api_key_usage_key_id" ON "api_key_usage_logs" ("api_key_id")`);
    await queryRunner.query(`CREATE INDEX "idx_api_key_usage_created_at" ON "api_key_usage_logs" ("created_at")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "api_key_usage_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "api_keys"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "api_key_status_enum"`);
  }
}
