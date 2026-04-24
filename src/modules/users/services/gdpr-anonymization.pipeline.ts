import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createHash } from 'crypto';

export interface AnonymizationResult {
  userId: string;
  userHash: string;
  tablesProcessed: string[];
  financialRecordsRetained: number;
  completedAt: Date;
}

@Injectable()
export class GdprAnonymizationPipeline {
  private readonly logger = new Logger(GdprAnonymizationPipeline.name);

  constructor(private readonly dataSource: DataSource) {}

  async run(userId: string): Promise<AnonymizationResult> {
    const userHash = createHash('sha256').update(userId).digest('hex');
    const anonymizedEmail = `deleted-${userHash.slice(0, 12)}@nexafx.invalid`;
    const tablesProcessed: string[] = [];

    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();

    try {
      await runner.manager.query(
        `UPDATE users SET email = $1, first_name = 'DELETED', last_name = 'DELETED',
         phone = NULL, ip_address = NULL, updated_at = NOW() WHERE id = $2`,
        [anonymizedEmail, userId],
      );
      tablesProcessed.push('users');

      await runner.manager.query(
        `UPDATE audit_logs SET ip_address = NULL, user_agent = NULL WHERE user_id = $1`,
        [userId],
      );
      tablesProcessed.push('audit_logs');

      await runner.manager.query(
        `UPDATE api_usage_logs SET ip_address = NULL WHERE user_id = $1`,
        [userId],
      );
      tablesProcessed.push('api_usage_logs');

      const [{ count }] = await runner.manager.query(
        `SELECT COUNT(*) AS count FROM transactions WHERE user_id = $1`,
        [userId],
      );

      await runner.commitTransaction();
      this.logger.log(`GDPR anonymization complete for user ${userId}`);

      return {
        userId,
        userHash,
        tablesProcessed,
        financialRecordsRetained: Number(count),
        completedAt: new Date(),
      };
    } catch (err) {
      await runner.rollbackTransaction();
      this.logger.error(`GDPR anonymization failed for user ${userId}`, err);
      throw err;
    } finally {
      await runner.release();
    }
  }
}
