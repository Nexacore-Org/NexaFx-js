import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #1446: delivery history is queried by endpoint ordered by recency, but
 * `webhook_deliveries` had no index supporting that access pattern. Add a
 * composite `(endpointId, createdAt)` index so the paginated list is an index
 * scan rather than a sequential scan of the whole table.
 */
export class AddWebhookDeliveriesEndpointCreatedAtIndex1753100000000
  implements MigrationInterface
{
  name = 'AddWebhookDeliveriesEndpointCreatedAtIndex1753100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_webhook_deliveries_endpoint_created_at" ON "webhook_deliveries" ("endpointId", "createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_webhook_deliveries_endpoint_created_at"`,
    );
  }
}
