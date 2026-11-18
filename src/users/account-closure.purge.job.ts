import { Injectable, Logger } from '@nestjs/common';
import { CronExpression } from '@nestjs/schedule';
import { ClusterCron } from '../common/locks/cluster-cron.decorator';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { IsNull, LessThanOrEqual, Repository } from 'typeorm';
import { User } from './user.entity';

/**
 * Anonymises closed accounts once the retention period has passed. Only
 * personal fields on `users` are scrubbed; transaction, ledger and KYC records
 * keep pointing at the (now anonymous) row as the retention policy requires.
 */
@Injectable()
export class AccountClosurePurgeJob {
  private readonly logger = new Logger(AccountClosurePurgeJob.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  @ClusterCron(CronExpression.EVERY_DAY_AT_MIDNIGHT, 'users:account-closure-purge')
  async purgeExpiredPersonalData(): Promise<number> {
    const now = new Date();
    // Soft-deleted rows are hidden by default, so ask for them explicitly.
    const due = await this.usersRepository.find({
      withDeleted: true,
      where: { piiPurgeAt: LessThanOrEqual(now), piiPurgedAt: IsNull() },
    });

    for (const user of due) {
      await this.usersRepository.update(user.id, {
        email: `deleted-${user.id}@archived.local`,
        firstName: '[deleted]',
        lastName: '[deleted]',
        // Unusable credential: a random value that is not a valid bcrypt hash.
        passwordHash: `purged:${randomBytes(24).toString('hex')}`,
        isActive: false,
        piiPurgedAt: now,
      });
    }

    if (due.length > 0) {
      this.logger.log(`Anonymised personal data for ${due.length} closed accounts`);
    }
    return due.length;
  }
}
