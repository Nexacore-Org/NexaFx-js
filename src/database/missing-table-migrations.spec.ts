import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const MIGRATIONS_DIR = join(ROOT, 'src', 'database', 'migrations');

interface MigrationSource {
  file: string;
  source: string;
  up: string;
  down: string;
}

const migrations: MigrationSource[] = readdirSync(MIGRATIONS_DIR)
  .filter((file) => file.endsWith('.ts'))
  .map((file) => {
    const source = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    const up =
      source.split('public async up(')[1]?.split('public async down(')[0] ?? '';
    const down = source.split('public async down(')[1] ?? '';
    return { file, source, up, down };
  });

const TABLES = [
  'notification_preferences',
  'activity_feed_items',
  'rate_alerts',
  'rate_alert_history',
  'referral_rewards',
  'scheduled_reports',
  'ticket_messages',
  'endpoint_rate_limit_configs',
  'rate_limit_rules',
  'rate_limit_records',
];

describe('missing table migrations (issues #1592 and #1593)', () => {
  it.each(TABLES)('%s is created and dropped by a migration', (table) => {
    const creating = migrations.filter((migration) =>
      migration.up.includes(`CREATE TABLE IF NOT EXISTS "${table}"`),
    );
    expect(creating).toHaveLength(1);
    expect(creating[0].down).toContain(`DROP TABLE IF EXISTS "${table}"`);
    expect(creating[0].source).toContain('implements MigrationInterface');
  });

  it('creates referral_rewards before SplitReferralCodes1754100000000', () => {
    const creating = migrations.find((migration) =>
      migration.up.includes('CREATE TABLE IF NOT EXISTS "referral_rewards"'),
    );
    expect(creating).toBeDefined();
    const timestamp = creating!.file.match(/(\d{13})/)?.[1];
    expect(timestamp).toBeDefined();
    expect(Number(timestamp)).toBeLessThan(1754100000000);
  });

  it('declares both scheduled report enums and drops them on revert', () => {
    const migration = migrations.find((m) =>
      m.file.startsWith('CreateScheduledReports'),
    );
    expect(migration).toBeDefined();
    expect(migration!.up).toContain(
      'CREATE TYPE "scheduled_reports_reporttype_enum"',
    );
    expect(migration!.up).toContain(
      'CREATE TYPE "scheduled_reports_frequency_enum"',
    );
    expect(migration!.up).toContain(
      '"reportType" "scheduled_reports_reporttype_enum" NOT NULL',
    );
    expect(migration!.up).toContain(
      '"frequency" "scheduled_reports_frequency_enum" NOT NULL',
    );
    expect(migration!.down).toContain(
      'DROP TYPE IF EXISTS "scheduled_reports_frequency_enum"',
    );
    expect(migration!.down).toContain(
      'DROP TYPE IF EXISTS "scheduled_reports_reporttype_enum"',
    );
  });

  it('keeps schema parity details for rate limit tables', () => {
    const rules = migrations.find((m) =>
      m.file.startsWith('CreateRateLimitRules'),
    );
    const records = migrations.find((m) =>
      m.file.startsWith('CreateRateLimitRecords'),
    );
    const configs = migrations.find((m) =>
      m.file.startsWith('CreateEndpointRateLimitConfigs'),
    );
    expect(rules!.up).toContain(
      `COMMENT ON COLUMN "rate_limit_rules"."windowSeconds" IS 'Window length in seconds'`,
    );
    expect(records!.up).toContain('"windowStart" timestamptz NOT NULL');
    expect(configs!.up).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS "UQ_5ebaab1c6d9e357e782d6a2aec5" ON "endpoint_rate_limit_configs" ("endpoint")',
    );
    expect(configs!.up).not.toContain('"method")');
  });

  it('uses the explicit index names declared by the entities', () => {
    const expected: Array<[string, string]> = [
      [
        'CreateNotificationPreferences',
        'UQ_notification_preferences_user_channel_event',
      ],
      ['CreateActivityFeedItems', 'IDX_activity_feed_items_user_created'],
      ['CreateRateAlerts', 'IDX_rate_alerts_user'],
      ['CreateRateAlertHistory', 'IDX_rate_alert_history_alert'],
      ['CreateReferralRewards', 'UQ_referral_rewards_referral_recipient'],
      ['CreateScheduledReports', 'IDX_scheduled_reports_user_active'],
      ['CreateTicketMessages', 'idx_ticket_messages_ticket_id'],
      ['CreateRateLimitRules', 'idx_rate_limit_rules_endpoint'],
      ['CreateRateLimitRecords', 'idx_rate_limit_records_user_endpoint'],
    ];
    for (const [file, indexName] of expected) {
      const migration = migrations.find((m) => m.file.startsWith(file));
      expect(migration).toBeDefined();
      expect(migration!.up).toContain(`"${indexName}"`);
      expect(migration!.down).toContain(`"${indexName}"`);
    }
  });
});
