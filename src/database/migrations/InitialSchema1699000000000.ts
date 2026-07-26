import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1699000000000 implements MigrationInterface {
  name = 'InitialSchema1699000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ----------------------------------------------------------------
    // Enum types
    // ----------------------------------------------------------------
    await queryRunner.query(`
      CREATE TYPE "transactions_status_enum" AS ENUM('pending', 'completed', 'failed', 'reversed')
    `);
    await queryRunner.query(`
      CREATE TYPE "kyc_documents_status_enum" AS ENUM('pending', 'approved', 'rejected')
    `);
    await queryRunner.query(`
      CREATE TYPE "otps_purpose_enum" AS ENUM('email-verify', '2fa', 'password-reset')
    `);
    await queryRunner.query(`
      CREATE TYPE "ledger_entries_type_enum" AS ENUM('credit', 'debit')
    `);
    await queryRunner.query(`
      CREATE TYPE "device_tokens_platform_enum" AS ENUM('ios', 'android', 'web')
    `);
    await queryRunner.query(`
      CREATE TYPE "organisations_kyc_status_enum" AS ENUM('pending', 'verified', 'rejected')
    `);
    await queryRunner.query(`
      CREATE TYPE "organisation_members_role_enum" AS ENUM('owner', 'admin', 'member')
    `);
    await queryRunner.query(`
      CREATE TYPE "support_tickets_category_enum" AS ENUM('transaction', 'kyc', 'account', 'other')
    `);
    await queryRunner.query(`
      CREATE TYPE "support_tickets_status_enum" AS ENUM('open', 'in-progress', 'resolved', 'closed')
    `);
    await queryRunner.query(`
      CREATE TYPE "webhook_deliveries_status_enum" AS ENUM('pending', 'delivered', 'failed', 'expired')
    `);

    // ----------------------------------------------------------------
    // users
    // ----------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id"              uuid                NOT NULL DEFAULT gen_random_uuid(),
        "email"           character varying   NOT NULL,
        "passwordHash"    character varying   NOT NULL,
        "firstName"       character varying   NOT NULL,
        "lastName"        character varying   NOT NULL,
        "role"            character varying   NOT NULL DEFAULT 'user',
        "isEmailVerified" boolean             NOT NULL DEFAULT false,
        "kycStatus"       character varying   NOT NULL DEFAULT 'pending',
        "isActive"        boolean             NOT NULL DEFAULT true,
        "createdAt"       TIMESTAMP           NOT NULL DEFAULT now(),
        "updatedAt"       TIMESTAMP           NOT NULL DEFAULT now(),
        CONSTRAINT "PK_users" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_users_email" ON "users" ("email")`);

    // ----------------------------------------------------------------
    // user_accounts
    // ----------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "user_accounts" (
        "id"               uuid      NOT NULL,
        "email"            text      NOT NULL,
        "displayName"      text      NOT NULL,
        "passwordSalt"     text      NOT NULL,
        "passwordHash"     text      NOT NULL,
        "twoFactorSecret"  text      NOT NULL,
        "isActive"         boolean   NOT NULL DEFAULT true,
        "deletedAt"        TIMESTAMP,
        "closedAt"         TIMESTAMP,
        "piiPurgeAt"       TIMESTAMP,
        "piiPurgedAt"      TIMESTAMP,
        "finalEmailSentAt" TIMESTAMP,
        "createdAt"        TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"        TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_accounts" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_user_accounts_email"     ON "user_accounts" ("email")`);
    await queryRunner.query(`CREATE INDEX "IDX_user_accounts_deletedAt"       ON "user_accounts" ("deletedAt")`);
    await queryRunner.query(`CREATE INDEX "IDX_user_accounts_piiPurgeAt"      ON "user_accounts" ("piiPurgeAt")`);

    // ----------------------------------------------------------------
    // wallet_balances
    // ----------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "wallet_balances" (
        "id"         uuid                   NOT NULL DEFAULT gen_random_uuid(),
        "accountId"  character varying(36)  NOT NULL,
        "currency"   character varying(3)   NOT NULL,
        "balance"    numeric(20,2)          NOT NULL DEFAULT 0,
        "createdAt"  TIMESTAMP              NOT NULL DEFAULT now(),
        "updatedAt"  TIMESTAMP              NOT NULL DEFAULT now(),
        "version"    integer                NOT NULL DEFAULT 0,
        CONSTRAINT "PK_wallet_balances" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_wallet_balances_accountId_currency" ON "wallet_balances" ("accountId", "currency")`);

    // ----------------------------------------------------------------
    // transactions
    // NOTE: amount/fee start at numeric(18,8); AlterTxHash migration
    //       alters them to numeric(20,8) on existing databases.
    // ----------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "transactions" (
        "id"                    uuid                          NOT NULL DEFAULT gen_random_uuid(),
        "senderId"              uuid                          NOT NULL,
        "receiverId"            uuid                          NOT NULL,
        "amount"                numeric(18,8)                 NOT NULL,
        "currency"              character varying(10)         NOT NULL,
        "fee"                   numeric(18,8)                 NOT NULL DEFAULT 0,
        "status"                "transactions_status_enum"    NOT NULL DEFAULT 'pending',
        "reference"             character varying             NOT NULL,
        "metadata"              jsonb,
        "createdAt"             TIMESTAMP                     NOT NULL DEFAULT now(),
        "completedAt"           TIMESTAMP,
        "reversedAt"            TIMESTAMP,
        "reversedBy"            uuid,
        "reversalReason"        text,
        "reversalTransactionId" uuid,
        "retryCount"            integer                       NOT NULL DEFAULT 0,
        "txHash"                character varying(128),
        "deletedAt"             TIMESTAMP,
        CONSTRAINT "PK_transactions"            PRIMARY KEY ("id"),
        CONSTRAINT "UQ_transactions_reference"  UNIQUE      ("reference")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_transactions_senderId_createdAt"  ON "transactions" ("senderId", "createdAt")`);
    await queryRunner.query(`CREATE INDEX "IDX_transactions_status_createdAt"    ON "transactions" ("status", "createdAt")`);
    await queryRunner.query(`CREATE INDEX "IDX_transactions_currency_createdAt"  ON "transactions" ("currency", "createdAt")`);
    await queryRunner.query(`CREATE INDEX "IDX_transactions_senderId"            ON "transactions" ("senderId")`);
    await queryRunner.query(`CREATE INDEX "IDX_transactions_receiverId"          ON "transactions" ("receiverId")`);
    await queryRunner.query(`CREATE INDEX "IDX_transactions_createdAt"           ON "transactions" ("createdAt")`);

    // ----------------------------------------------------------------
    // refresh_tokens
    // ----------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id"               uuid      NOT NULL,
        "userId"           text      NOT NULL,
        "familyId"         uuid      NOT NULL,
        "tokenHash"        text      NOT NULL,
        "parentTokenId"    uuid,
        "replacedByTokenId" uuid,
        "expiresAt"        TIMESTAMP NOT NULL,
        "revokedAt"        TIMESTAMP,
        "createdAt"        TIMESTAMP NOT NULL DEFAULT now(),
        "lastUsedAt"       TIMESTAMP,
        CONSTRAINT "PK_refresh_tokens" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_refresh_tokens_tokenHash"  ON "refresh_tokens" ("tokenHash")`);
    await queryRunner.query(`CREATE INDEX "IDX_refresh_tokens_userId"           ON "refresh_tokens" ("userId")`);
    await queryRunner.query(`CREATE INDEX "IDX_refresh_tokens_familyId"         ON "refresh_tokens" ("familyId")`);
    await queryRunner.query(`CREATE INDEX "IDX_refresh_tokens_expiresAt"        ON "refresh_tokens" ("expiresAt")`);

    // ----------------------------------------------------------------
    // password_reset_tokens
    // ----------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "password_reset_tokens" (
        "id"        uuid              NOT NULL DEFAULT gen_random_uuid(),
        "userId"    character varying NOT NULL,
        "tokenHash" character varying NOT NULL,
        "attempts"  integer           NOT NULL DEFAULT 0,
        "expiresAt" TIMESTAMP         NOT NULL,
        "used"      boolean           NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP         NOT NULL DEFAULT now(),
        CONSTRAINT "PK_password_reset_tokens" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_password_reset_tokens_userId" ON "password_reset_tokens" ("userId")`);

    // ----------------------------------------------------------------
    // idempotency_keys
    // key starts as TEXT; AlterIdempotencyKeyLength migration changes
    // it to VARCHAR(255) on existing databases.
    // ----------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "idempotency_keys" (
        "key"         text      NOT NULL,
        "requestHash" text      NOT NULL,
        "response"    jsonb     NOT NULL,
        "statusCode"  integer   NOT NULL,
        "createdAt"   TIMESTAMP NOT NULL DEFAULT now(),
        "expiresAt"   TIMESTAMP,
        CONSTRAINT "PK_idempotency_keys" PRIMARY KEY ("key")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_idempotency_keys_createdAt" ON "idempotency_keys" ("createdAt")`);
    await queryRunner.query(`CREATE INDEX "IDX_idempotency_keys_expiresAt" ON "idempotency_keys" ("expiresAt")`);

    // ----------------------------------------------------------------
    // kyc_documents
    // ----------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "kyc_documents" (
        "id"             uuid                        NOT NULL DEFAULT gen_random_uuid(),
        "userId"         uuid                        NOT NULL,
        "documentType"   character varying           NOT NULL,
        "documentNumber" character varying           NOT NULL,
        "documentUrl"    character varying           NOT NULL,
        "status"         "kyc_documents_status_enum" NOT NULL DEFAULT 'pending',
        "reviewedBy"     uuid,
        "reviewedAt"     TIMESTAMP,
        "createdAt"      TIMESTAMP                   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_kyc_documents" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_kyc_documents_userId" ON "kyc_documents" ("userId")`);
    await queryRunner.query(`CREATE INDEX "IDX_kyc_documents_status" ON "kyc_documents" ("status")`);

    // ----------------------------------------------------------------
    // otps
    // ----------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "otps" (
        "id"        uuid                  NOT NULL DEFAULT gen_random_uuid(),
        "userId"    uuid                  NOT NULL,
        "codeHash"  character varying     NOT NULL,
        "purpose"   "otps_purpose_enum"   NOT NULL,
        "attempts"  integer               NOT NULL DEFAULT 0,
        "expiresAt" TIMESTAMP             NOT NULL,
        "usedAt"    TIMESTAMP,
        "createdAt" TIMESTAMP             NOT NULL DEFAULT now(),
        CONSTRAINT "PK_otps" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_otps_userId_purpose" ON "otps" ("userId", "purpose")`);
    await queryRunner.query(`CREATE INDEX "IDX_otps_expiresAt"       ON "otps" ("expiresAt")`);

    // ----------------------------------------------------------------
    // activity_events
    // ----------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "activity_events" (
        "id"            uuid              NOT NULL DEFAULT gen_random_uuid(),
        "userId"        character varying NOT NULL,
        "type"          character varying NOT NULL,
        "description"   text              NOT NULL,
        "ipAddress"     character varying,
        "deviceInfo"    character varying,
        "securityEvent" boolean           NOT NULL DEFAULT false,
        "metadata"      jsonb,
        "createdAt"     TIMESTAMP         NOT NULL DEFAULT now(),
        CONSTRAINT "PK_activity_events" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_activity_events_userId_createdAt" ON "activity_events" ("userId", "createdAt")`);
    await queryRunner.query(`CREATE INDEX "IDX_activity_events_type"             ON "activity_events" ("type")`);

    // ----------------------------------------------------------------
    // aml_alerts
    // ----------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "aml_alerts" (
        "id"            uuid              NOT NULL DEFAULT gen_random_uuid(),
        "userId"        uuid              NOT NULL,
        "ruleTriggered" character varying NOT NULL,
        "riskScore"     integer           NOT NULL,
        "metadata"      jsonb,
        "reviewedAt"    TIMESTAMP,
        "createdAt"     TIMESTAMP         NOT NULL DEFAULT now(),
        CONSTRAINT "PK_aml_alerts" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_aml_alerts_userId"        ON "aml_alerts" ("userId")`);
    await queryRunner.query(`CREATE INDEX "IDX_aml_alerts_ruleTriggered" ON "aml_alerts" ("ruleTriggered")`);
    await queryRunner.query(`CREATE INDEX "IDX_aml_alerts_createdAt"     ON "aml_alerts" ("createdAt")`);

    // ----------------------------------------------------------------
    // audit_logs  (simple-json => text in postgres)
    // ----------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id"         uuid              NOT NULL DEFAULT gen_random_uuid(),
        "userId"     uuid,
        "action"     character varying NOT NULL,
        "entityType" character varying NOT NULL,
        "entityId"   character varying,
        "before"     text,
        "after"      text,
        "ipAddress"  character varying,
        "userAgent"  character varying,
        "createdAt"  TIMESTAMP         NOT NULL DEFAULT now(),
        CONSTRAINT "PK_audit_logs" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_audit_logs_userId"              ON "audit_logs" ("userId")`);
    await queryRunner.query(`CREATE INDEX "IDX_audit_logs_entityType_entityId" ON "audit_logs" ("entityType", "entityId")`);
    await queryRunner.query(`CREATE INDEX "IDX_audit_logs_createdAt"           ON "audit_logs" ("createdAt")`);

    // ----------------------------------------------------------------
    // fx_trades
    // ----------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "fx_trades" (
        "id"           uuid                  NOT NULL DEFAULT gen_random_uuid(),
        "userId"       uuid                  NOT NULL,
        "fromCurrency" character varying(10) NOT NULL,
        "toCurrency"   character varying(10) NOT NULL,
        "fromAmount"   numeric(18,8)         NOT NULL,
        "toAmount"     numeric(18,8)         NOT NULL,
        "rate"         numeric(18,8)         NOT NULL,
        "executedAt"   TIMESTAMP             NOT NULL DEFAULT now(),
        "reversedAt"   TIMESTAMP,
        "deletedAt"    TIMESTAMP,
        CONSTRAINT "PK_fx_trades" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_fx_trades_userId"      ON "fx_trades" ("userId")`);
    await queryRunner.query(`CREATE INDEX "IDX_fx_trades_executedAt"  ON "fx_trades" ("executedAt")`);

    // ----------------------------------------------------------------
    // ledger_entries
    // ----------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "ledger_entries" (
        "id"            uuid                      NOT NULL DEFAULT gen_random_uuid(),
        "userId"        uuid                      NOT NULL,
        "transactionId" uuid,
        "type"          "ledger_entries_type_enum" NOT NULL,
        "amount"        numeric(18,8)             NOT NULL,
        "currency"      character varying(10)     NOT NULL,
        "balanceAfter"  numeric(18,8)             NOT NULL,
        "description"   text,
        "createdAt"     TIMESTAMP                 NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ledger_entries" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_ledger_entries_userId_createdAt" ON "ledger_entries" ("userId", "createdAt")`);
    await queryRunner.query(`CREATE INDEX "IDX_ledger_entries_userId"           ON "ledger_entries" ("userId")`);
    await queryRunner.query(`CREATE INDEX "IDX_ledger_entries_transactionId"    ON "ledger_entries" ("transactionId")`);

    // ----------------------------------------------------------------
    // device_tokens
    // ----------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "device_tokens" (
        "id"         uuid                          NOT NULL DEFAULT gen_random_uuid(),
        "userId"     uuid                          NOT NULL,
        "token"      character varying             NOT NULL,
        "platform"   "device_tokens_platform_enum" NOT NULL,
        "createdAt"  TIMESTAMP                     NOT NULL DEFAULT now(),
        "lastUsedAt" TIMESTAMP,
        CONSTRAINT "PK_device_tokens"       PRIMARY KEY ("id"),
        CONSTRAINT "UQ_device_tokens_token" UNIQUE      ("token")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_device_tokens_userId" ON "device_tokens" ("userId")`);

    // ----------------------------------------------------------------
    // organisations
    // ----------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "organisations" (
        "id"                 uuid                           NOT NULL DEFAULT gen_random_uuid(),
        "name"               character varying(255)         NOT NULL,
        "registrationNumber" character varying(100),
        "country"            character varying(100)         NOT NULL,
        "kycStatus"          "organisations_kyc_status_enum" NOT NULL DEFAULT 'pending',
        "ownerId"            uuid                           NOT NULL,
        "createdAt"          TIMESTAMP                      NOT NULL DEFAULT now(),
        CONSTRAINT "PK_organisations" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_organisations_ownerId" ON "organisations" ("ownerId")`);

    // ----------------------------------------------------------------
    // organisation_members  (simple-array => text)
    // ----------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "organisation_members" (
        "id"             uuid                           NOT NULL DEFAULT gen_random_uuid(),
        "organisationId" uuid                           NOT NULL,
        "userId"         uuid                           NOT NULL,
        "role"           "organisation_members_role_enum" NOT NULL DEFAULT 'member',
        "permissions"    text,
        "joinedAt"       TIMESTAMP                      NOT NULL DEFAULT now(),
        CONSTRAINT "PK_organisation_members"            PRIMARY KEY ("id"),
        CONSTRAINT "UQ_organisation_members_org_user"   UNIQUE ("organisationId", "userId")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_organisation_members_organisationId" ON "organisation_members" ("organisationId")`);

    // ----------------------------------------------------------------
    // ledger_verification_results
    // ----------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "ledger_verification_results" (
        "id"               uuid      NOT NULL DEFAULT gen_random_uuid(),
        "ranAt"            TIMESTAMP NOT NULL DEFAULT now(),
        "totalChecked"     integer   NOT NULL DEFAULT 0,
        "discrepancyCount" integer   NOT NULL DEFAULT 0,
        "discrepancies"    jsonb,
        CONSTRAINT "PK_ledger_verification_results" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_ledger_verification_results_ranAt" ON "ledger_verification_results" ("ranAt")`);

    // ----------------------------------------------------------------
    // referrals
    // ----------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "referrals" (
        "id"         uuid              NOT NULL DEFAULT gen_random_uuid(),
        "referrerId" uuid              NOT NULL,
        "refereeId"  uuid              NOT NULL,
        "code"       character varying NOT NULL,
        "rewardPaid" boolean           NOT NULL DEFAULT false,
        "createdAt"  TIMESTAMP         NOT NULL DEFAULT now(),
        "deletedAt"  TIMESTAMP,
        CONSTRAINT "PK_referrals"          PRIMARY KEY ("id"),
        CONSTRAINT "UQ_referrals_refereeId" UNIQUE ("refereeId"),
        CONSTRAINT "UQ_referrals_code"      UNIQUE ("code")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_referrals_referrerId" ON "referrals" ("referrerId")`);

    // ----------------------------------------------------------------
    // support_tickets
    // ----------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "support_tickets" (
        "id"                uuid                          NOT NULL DEFAULT gen_random_uuid(),
        "userId"            character varying             NOT NULL,
        "subject"           character varying             NOT NULL,
        "description"       text                          NOT NULL,
        "category"          "support_tickets_category_enum" NOT NULL,
        "status"            "support_tickets_status_enum" NOT NULL DEFAULT 'open',
        "relatedEntityType" character varying,
        "relatedEntityId"   character varying,
        "updatedBy"         character varying,
        "resolvedAt"        TIMESTAMP,
        "createdAt"         TIMESTAMP                     NOT NULL DEFAULT now(),
        "updatedAt"         TIMESTAMP                     NOT NULL DEFAULT now(),
        CONSTRAINT "PK_support_tickets" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_support_tickets_userId" ON "support_tickets" ("userId")`);

    // ----------------------------------------------------------------
    // terms_acceptances
    // ----------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "terms_acceptances" (
        "id"         uuid              NOT NULL DEFAULT gen_random_uuid(),
        "userId"     uuid              NOT NULL,
        "version"    character varying NOT NULL,
        "acceptedAt" TIMESTAMP         NOT NULL DEFAULT now(),
        "ipAddress"  character varying,
        "userAgent"  character varying,
        CONSTRAINT "PK_terms_acceptances"                PRIMARY KEY ("id"),
        CONSTRAINT "UQ_terms_acceptances_userId_version" UNIQUE ("userId", "version")
      )
    `);

    // ----------------------------------------------------------------
    // webhook_endpoints  (simple-array => text)
    // ----------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "webhook_endpoints" (
        "id"       uuid              NOT NULL DEFAULT gen_random_uuid(),
        "ownerId"  character varying NOT NULL,
        "url"      character varying NOT NULL,
        "secret"   character varying NOT NULL,
        "events"   text              NOT NULL,
        "isActive" boolean           NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP        NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP        NOT NULL DEFAULT now(),
        CONSTRAINT "PK_webhook_endpoints" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_webhook_endpoints_ownerId" ON "webhook_endpoints" ("ownerId")`);

    // ----------------------------------------------------------------
    // webhook_deliveries
    // ----------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "webhook_deliveries" (
        "id"            uuid                              NOT NULL DEFAULT gen_random_uuid(),
        "endpointId"    character varying                 NOT NULL,
        "eventName"     character varying                 NOT NULL,
        "requestBody"   jsonb                             NOT NULL,
        "attemptCount"  integer                           NOT NULL DEFAULT 0,
        "responseCode"  integer,
        "errorMessage"  text,
        "status"        "webhook_deliveries_status_enum"  NOT NULL DEFAULT 'pending',
        "deliveredAt"   TIMESTAMP,
        "lastAttemptAt" TIMESTAMP,
        "createdAt"     TIMESTAMP                         NOT NULL DEFAULT now(),
        "updatedAt"     TIMESTAMP                         NOT NULL DEFAULT now(),
        CONSTRAINT "PK_webhook_deliveries" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_webhook_deliveries_endpointId" ON "webhook_deliveries" ("endpointId")`);
    await queryRunner.query(`CREATE INDEX "IDX_webhook_deliveries_eventName"  ON "webhook_deliveries" ("eventName")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // ----------------------------------------------------------------
    // Indexes
    // ----------------------------------------------------------------
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_webhook_deliveries_eventName"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_webhook_deliveries_endpointId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_webhook_endpoints_ownerId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_terms_acceptances_userId_version"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_support_tickets_userId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_referrals_referrerId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ledger_verification_results_ranAt"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_organisation_members_organisationId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_organisations_ownerId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_device_tokens_userId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ledger_entries_transactionId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ledger_entries_userId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ledger_entries_userId_createdAt"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_fx_trades_executedAt"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_fx_trades_userId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_logs_createdAt"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_logs_entityType_entityId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_logs_userId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_aml_alerts_createdAt"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_aml_alerts_ruleTriggered"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_aml_alerts_userId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_activity_events_type"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_activity_events_userId_createdAt"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_otps_expiresAt"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_otps_userId_purpose"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_kyc_documents_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_kyc_documents_userId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_idempotency_keys_expiresAt"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_idempotency_keys_createdAt"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_password_reset_tokens_userId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_refresh_tokens_tokenHash"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_refresh_tokens_expiresAt"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_refresh_tokens_familyId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_refresh_tokens_userId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_transactions_createdAt"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_transactions_receiverId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_transactions_senderId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_transactions_currency_createdAt"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_transactions_status_createdAt"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_transactions_senderId_createdAt"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_wallet_balances_accountId_currency"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_accounts_piiPurgeAt"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_accounts_deletedAt"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_user_accounts_email"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_users_email"`);

    // ----------------------------------------------------------------
    // Tables
    // ----------------------------------------------------------------
    await queryRunner.query(`DROP TABLE IF EXISTS "webhook_deliveries"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "webhook_endpoints"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "terms_acceptances"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "support_tickets"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "referrals"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ledger_verification_results"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "organisation_members"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "organisations"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "device_tokens"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ledger_entries"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "fx_trades"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "aml_alerts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "activity_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "otps"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "kyc_documents"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "idempotency_keys"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "password_reset_tokens"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "refresh_tokens"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "transactions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "wallet_balances"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_accounts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);

    // ----------------------------------------------------------------
    // Enum types
    // ----------------------------------------------------------------
    await queryRunner.query(`DROP TYPE IF EXISTS "webhook_deliveries_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "support_tickets_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "support_tickets_category_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "organisation_members_role_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "organisations_kyc_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "device_tokens_platform_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "ledger_entries_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "otps_purpose_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "kyc_documents_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "transactions_status_enum"`);
  }
}
