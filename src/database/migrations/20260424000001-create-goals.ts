import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateGoals20260424000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE goal_status_enum AS ENUM ('active', 'completed', 'cancelled', 'expired');
    `);

    await queryRunner.query(`
      CREATE TYPE contribution_source_enum AS ENUM ('manual', 'round_up');
    `);

    await queryRunner.query(`
      CREATE TABLE goals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" UUID NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        "targetAmount" DECIMAL(15,2) NOT NULL,
        "currentAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
        currency VARCHAR(3) NOT NULL DEFAULT 'USD',
        deadline TIMESTAMP,
        status goal_status_enum NOT NULL DEFAULT 'active',
        linked_wallet_id UUID,
        round_up_enabled BOOLEAN NOT NULL DEFAULT false,
        round_up_unit INT,
        milestones_notified INT NOT NULL DEFAULT 0,
        is_completed BOOLEAN NOT NULL DEFAULT false,
        completed_at TIMESTAMP,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX idx_goals_user_id ON goals ("userId");
    `);

    await queryRunner.query(`
      CREATE INDEX idx_goals_status ON goals (status);
    `);

    await queryRunner.query(`
      CREATE TABLE goal_contributions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
        amount DECIMAL(18,6) NOT NULL,
        currency VARCHAR(10) NOT NULL DEFAULT 'USD',
        source contribution_source_enum NOT NULL DEFAULT 'manual',
        transaction_id UUID,
        progress_snapshot DECIMAL(5,2) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX idx_goal_contributions_goal_created ON goal_contributions (goal_id, created_at);
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX idx_goal_contributions_transaction
        ON goal_contributions (goal_id, transaction_id)
        WHERE transaction_id IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS goal_contributions;`);
    await queryRunner.query(`DROP TABLE IF EXISTS goals;`);
    await queryRunner.query(`DROP TYPE IF EXISTS contribution_source_enum;`);
    await queryRunner.query(`DROP TYPE IF EXISTS goal_status_enum;`);
  }
}
