import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDevicesTrustXXXXXX implements MigrationInterface {
  name = 'CreateDevicesTrustXXXXXX';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "devices" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" varchar NOT NULL,
        "deviceKey" varchar(200) NOT NULL,
        "deviceName" varchar(300),
        "userAgent" varchar(300),
        "platform" varchar(80),
        "browser" varchar(80),
        "lastIp" varchar(60),
        "lastCountry" varchar(2),
        "lastCity" varchar(80),
        "lastLat" float,
        "lastLng" float,
        "trustScore" int NOT NULL DEFAULT 50,
        "trustLevel" varchar(20) NOT NULL DEFAULT 'neutral',
        "failedLoginCount" int NOT NULL DEFAULT 0,
        "lastLoginAt" TIMESTAMPTZ,
        "manuallyTrusted" boolean NOT NULL DEFAULT false,
        "manuallyRisky" boolean NOT NULL DEFAULT false,
        "trustSignals" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_devices_userId" ON "devices" ("userId");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_devices_deviceKey" ON "devices" ("deviceKey");
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_devices_user_deviceKey"
      ON "devices" ("userId", "deviceKey");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "devices"`);
  }
}
