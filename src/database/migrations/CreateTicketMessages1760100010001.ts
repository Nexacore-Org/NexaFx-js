import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTicketMessages1760100010001 implements MigrationInterface {
  name = 'CreateTicketMessages1760100010001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ticket_messages" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "ticketId" uuid NOT NULL,
        "senderId" uuid NOT NULL,
        "message" text NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_ticket_messages_ticket_id" ON "ticket_messages" ("ticketId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_ticket_messages_sender_id" ON "ticket_messages" ("senderId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_ticket_messages_ticket_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_ticket_messages_sender_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "ticket_messages"`);
  }
}
