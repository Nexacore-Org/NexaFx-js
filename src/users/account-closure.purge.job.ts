import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { LessThanOrEqual, IsNull, Repository } from 'typeorm';
import { UserAccount } from './user-account.entity';

@Injectable()
export class AccountClosurePurgeJob {
  private readonly logger = new Logger(AccountClosurePurgeJob.name);

  constructor(
    @InjectRepository(UserAccount)
    private readonly userAccountRepository: Repository<UserAccount>,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async purgeExpiredPersonalData(): Promise<void> {
    const now = new Date();
    const accountsToPurge = await this.userAccountRepository.find({
      where: {
        piiPurgeAt: LessThanOrEqual(now),
        piiPurgedAt: IsNull(),
      },
    });

    for (const account of accountsToPurge) {
      account.email = `deleted-${account.id}@archived.local`;
      account.displayName = 'Deleted User';
      account.passwordSalt = randomBytes(16).toString('hex');
      account.passwordHash = createHash('sha256')
        .update(account.id)
        .digest('hex');
      account.twoFactorSecret = randomBytes(20).toString('hex');
      account.piiPurgedAt = now;
      await this.userAccountRepository.save(account);
    }

    if (accountsToPurge.length > 0) {
      this.logger.log(
        `Purged personal data for ${accountsToPurge.length} closed accounts`,
      );
    }
  }
}
